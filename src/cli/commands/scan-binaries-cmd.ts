/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * agf scan-binaries — produce the SCANINFO.json release-trust artifact next to
 * BUILDINFO. The daily scan job (CI/cron) runs this. All logic lives in the pure
 * core (core/upgrade/scan-binaries.ts + scan-info.ts); this file is only the I/O
 * wire: the real VirusTotal fetcher (keyed by VT_API_KEY; a no-op when absent) and
 * the timestamp. Chosen as an agf CLI command instead of a standalone .mjs so it
 * reuses the tested core (DRY, non-dormant) and stays dogfoodable.
 */
import { Command } from 'commander'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { writeScanInfo, type VirusTotalFetcher } from '../../core/upgrade/scan-binaries.js'
import { resolveVtVerdict, type VtPorts } from '../../core/upgrade/virustotal-resolver.js'
import {
  checkServedIntegrity,
  parseExpectedShas,
  type ServedShaSource,
} from '../../core/upgrade/release-consistency.js'
import type { VirusTotalResult } from '../../schemas/scan-info.js'
import { createCliOutput } from '../shared/cli-output.js'

const VT = 'https://www.virustotal.com/api/v3'
const POLL_ATTEMPTS = 20
const POLL_INTERVAL_MS = 15_000

/** Sum a VT stats record ({malicious, suspicious, harmless, …}) into flagged/total. */
function statsToVerdict(sha256: string, stats: Record<string, unknown> | undefined): VirusTotalResult {
  let flagged = 0
  let total = 0
  for (const [engine, value] of Object.entries(stats ?? {})) {
    const n = typeof value === 'number' ? value : 0
    total += n
    if (engine === 'malicious' || engine === 'suspicious') flagged += n
  }
  return { flagged, total, permalink: `https://www.virustotal.com/gui/file/${sha256}` }
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Real VT v3 ports (DIP boundary): query-by-hash, large-file upload, analysis poll. */
function vtPorts(apiKey: string, sha256: string): VtPorts {
  const headers = { 'x-apikey': apiKey }
  return {
    async queryByHash(hash) {
      const res = await fetch(`${VT}/files/${hash}`, { headers })
      if (res.status === 404) return 'not-found'
      if (!res.ok) return null // 429 / 5xx → unavailable
      const json = (await res.json()) as { data?: { attributes?: { last_analysis_stats?: Record<string, unknown> } } }
      return statsToVerdict(hash, json.data?.attributes?.last_analysis_stats)
    },
    async upload(filePath) {
      // Files > 32MB need a dedicated upload URL (our binaries are ~100MB).
      const urlRes = await fetch(`${VT}/files/upload_url`, { headers })
      const uploadUrl = ((await urlRes.json()) as { data?: string }).data ?? `${VT}/files`
      const form = new FormData()
      form.append('file', new Blob([await readFile(filePath)]), filePath.split('/').pop() ?? 'binary')
      const up = await fetch(uploadUrl, { method: 'POST', headers, body: form })
      return ((await up.json()) as { data?: { id?: string } }).data?.id ?? ''
    },
    async poll(analysisId) {
      for (let i = 0; i < POLL_ATTEMPTS; i++) {
        const res = await fetch(`${VT}/analyses/${analysisId}`, { headers })
        const json = (await res.json()) as {
          data?: { attributes?: { status?: string; stats?: Record<string, unknown> } }
        }
        const attrs = json.data?.attributes
        if (attrs?.status === 'completed') return statsToVerdict(sha256, attrs.stats)
        await delay(POLL_INTERVAL_MS)
      }
      return null // analysis still queued after the budget → checksum-only badge
    },
  }
}

/** Build a VT fetcher rooted at `outDir`; without a key it is a no-op. */
function makeVtFetcher(apiKey: string | undefined, outDir: string): VirusTotalFetcher {
  if (!apiKey) return async () => null
  return async ({ name, sha256 }) => resolveVtVerdict({ sha256, filePath: join(outDir, name) }, vtPorts(apiKey, sha256))
}

/**
 * node_wire_4898e9da47e2 — release-consistency wire. Downloads each asset's
 * real bytes over HTTP(S) and hashes them — the consumer-mode signal that
 * catches a stale CDN edge even when origin + BUILDINFO agree (the
 * 2026-07-03 windows incident this module's docblock documents).
 */
function httpServedShaFetcher(baseUrl: string): ServedShaSource {
  return async (assetName: string): Promise<string | null> => {
    const url = `${baseUrl.replace(/\/+$/, '')}/${assetName}`
    const res = await fetch(url)
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    return createHash('sha256').update(bytes).digest('hex')
  }
}

export function scanBinariesCommand(): Command {
  const cmd = new Command('scan-binaries')
    .description('Write SCANINFO.json (release trust artifact) next to BUILDINFO in <out>')
    .option('-o, --out <dir>', 'Release output dir containing BUILDINFO', 'dist-bun')
    .option('--select <path>', 'Dot-path filter on output data')
    .action(async (opts: { out: string; select?: string }) => {
      const out = createCliOutput('scan-binaries')
      try {
        const info = await writeScanInfo(opts.out, {
          fetchVirusTotal: makeVtFetcher(process.env.VT_API_KEY, opts.out),
          scannedAt: new Date().toISOString(),
        })
        out.ok({
          verdict: info.verdict,
          version: info.version,
          assets: info.assets.length,
          scanned: info.assets.filter((a) => a.virustotal !== null).length,
          path: `${opts.out}/SCANINFO.json`,
        })
      } catch (err) {
        out.err('SCAN_FAILED', String(err))
      }
    })

  cmd
    .command('check-served')
    .description('Verify the sha256 each release asset serves over HTTPS matches BUILDINFO (catches a stale CDN edge)')
    .requiredOption('--build-info <path>', 'Path to a published BUILDINFO JSON file')
    .requiredOption(
      '--base-url <url>',
      'Base URL the assets are served from (e.g. https://github.com/DiegoNogueiraDev/agf/releases/latest/download)',
    )
    .action(async (opts: { buildInfo: string; baseUrl: string }) => {
      const out = createCliOutput('scan-binaries.check-served')
      try {
        const buildInfoJson = await readFile(opts.buildInfo, 'utf8')
        const expected = parseExpectedShas(buildInfoJson)
        const result = await checkServedIntegrity(expected, httpServedShaFetcher(opts.baseUrl))
        out.ok(result)
      } catch (err) {
        out.err('CHECK_SERVED_FAILED', String(err))
      }
    })

  return cmd
}
