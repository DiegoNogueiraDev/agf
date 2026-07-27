/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * scan-binaries (core) — turn the published BUILDINFO targets into per-asset
 * ScanAssets, fetching the optional VirusTotal verdict per binary. Pure over an
 * injected VT fetcher (DIP): the real script wires an HTTP fetcher (or a no-op when
 * VT_API_KEY is absent). NEVER throws for one bad channel — a failed/absent VT scan
 * folds to `virustotal: null` so SCANINFO still ships the checksum+signature signal.
 *
 * Reuses the fields pack-bun.mjs already writes into BUILDINFO (out/os/sha256/signed)
 * — no need to re-hash the binaries. Feeds buildScanInfo (scan-info.ts) downstream.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ScanAsset, ScanInfo, SignatureStatus, VirusTotalResult } from '../../schemas/scan-info.js'
import { buildScanInfo } from './scan-info.js'
import { atomicJsonWrite } from '../utils/atomic-json-write.js'

/** The subset of a BUILDINFO target entry this module needs (as pack-bun.mjs writes it). */
export interface BuildInfoTarget {
  out: string
  os: string
  sha256?: string
  signed?: boolean
}

/** Look up the VirusTotal verdict for one asset; return null when unavailable/no key. */
export type VirusTotalFetcher = (asset: { name: string; sha256: string }) => Promise<VirusTotalResult | null>

/** Map BUILDINFO's boolean `signed` + os to the SCANINFO signature status. */
export function signatureFor(target: BuildInfoTarget): SignatureStatus {
  if (!target.signed) return 'unsigned'
  // darwin binaries are ad-hoc signed (signDarwinAdhoc); anything else signed is a real cert.
  return target.os === 'darwin' ? 'adhoc' : 'signed'
}

/** Build ScanAssets from BUILDINFO targets, attaching the VT verdict (or null). */
export async function collectScanAssets(
  targets: readonly BuildInfoTarget[],
  fetchVirusTotal: VirusTotalFetcher,
): Promise<ScanAsset[]> {
  return Promise.all(
    targets.map(async (t): Promise<ScanAsset> => {
      const sha256 = t.sha256 ?? ''
      let virustotal: VirusTotalResult | null = null
      if (sha256) {
        try {
          virustotal = await fetchVirusTotal({ name: t.out, sha256 })
        } catch {
          virustotal = null // timeout / 5xx / rate-limit → fold to null, keep the checksum
        }
      }
      return { name: t.out, sha256, signature: signatureFor(t), virustotal }
    }),
  )
}

export interface WriteScanInfoOptions {
  fetchVirusTotal: VirusTotalFetcher
  /** Injected ISO timestamp (the CLI passes new Date().toISOString()). */
  scannedAt: string
}

/**
 * Read `<outDir>/BUILDINFO`, collect the per-asset scan facts, and write
 * `<outDir>/SCANINFO.json` next to it. Returns the written payload. The daily scan
 * job (CLI/CI) calls this; the fetcher + timestamp are injected so this is testable.
 */
export async function writeScanInfo(outDir: string, opts: WriteScanInfoOptions): Promise<ScanInfo> {
  const buildInfo = JSON.parse(readFileSync(join(outDir, 'BUILDINFO'), 'utf8')) as {
    version?: string
    targets?: BuildInfoTarget[]
  }
  const assets = await collectScanAssets(buildInfo.targets ?? [], opts.fetchVirusTotal)
  const info = buildScanInfo({ version: buildInfo.version ?? '', scannedAt: opts.scannedAt, assets })
  // node_wire_4f0ea273afe7 — atomic-json-write wire. SCANINFO.json is a
  // public trust artifact read by the site's download-safety badge; a crash
  // mid-write (the daily cron job) must never leave a half-written file.
  atomicJsonWrite(join(outDir, 'SCANINFO.json'), info)
  return info
}
