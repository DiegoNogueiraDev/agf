/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { collectScanAssets, signatureFor, writeScanInfo, type BuildInfoTarget } from '../core/upgrade/scan-binaries.js'
import { buildScanInfo } from '../core/upgrade/scan-info.js'
import { scanInfoSchema, type VirusTotalResult } from '../schemas/scan-info.js'
import * as atomicJsonWriteModule from '../core/utils/atomic-json-write.js'

const TARGETS: BuildInfoTarget[] = [
  { out: 'agf-darwin-arm64', os: 'darwin', sha256: 'a'.repeat(64), signed: true },
  { out: 'agf-linux-x64', os: 'linux', sha256: 'b'.repeat(64), signed: false },
  { out: 'agf-windows-x64.exe', os: 'win32', sha256: 'c'.repeat(64), signed: false },
]

const noKeyFetcher = async (): Promise<VirusTotalResult | null> => null

describe('signatureFor', () => {
  it('maps darwin+signed to adhoc, other+signed to signed, unsigned to unsigned', () => {
    expect(signatureFor({ out: 'x', os: 'darwin', signed: true })).toBe('adhoc')
    expect(signatureFor({ out: 'x', os: 'win32', signed: true })).toBe('signed')
    expect(signatureFor({ out: 'x', os: 'linux', signed: false })).toBe('unsigned')
  })
})

describe('collectScanAssets', () => {
  it('with no VT key (fetcher returns null) → virustotal null on every asset, verdict never flagged', async () => {
    const assets = await collectScanAssets(TARGETS, noKeyFetcher)
    expect(assets.every((a) => a.virustotal === null)).toBe(true)
    const info = buildScanInfo({ version: '0.20.5', scannedAt: '2026-07-03T00:00:00.000Z', assets })
    expect(info.verdict).not.toBe('flagged')
  })

  it('preserves sha256 even when the VT fetch throws (timeout/5xx) — no crash', async () => {
    const throwingFetcher = async () => {
      throw new Error('VT 503')
    }
    const assets = await collectScanAssets(TARGETS, throwingFetcher)
    expect(assets.map((a) => a.sha256)).toEqual([TARGETS[0].sha256, TARGETS[1].sha256, TARGETS[2].sha256])
    expect(assets.every((a) => a.virustotal === null)).toBe(true)
  })

  it('records a VT hit when the fetcher returns a result', async () => {
    const hitFetcher = async (a: { name: string }): Promise<VirusTotalResult | null> =>
      a.name === 'agf-windows-x64.exe' ? { flagged: 2, total: 72, permalink: 'https://vt/x' } : null
    const assets = await collectScanAssets(TARGETS, hitFetcher)
    const info = buildScanInfo({ version: '0.20.5', scannedAt: '2026-07-03T00:00:00.000Z', assets })
    expect(info.verdict).toBe('flagged')
  })

  it('produces assets that assemble into a schema-valid SCANINFO', async () => {
    const assets = await collectScanAssets(TARGETS, noKeyFetcher)
    const info = buildScanInfo({ version: '0.20.5', scannedAt: '2026-07-03T00:00:00.000Z', assets })
    expect(() => scanInfoSchema.parse(info)).not.toThrow()
  })
})

describe('writeScanInfo — produces SCANINFO.json next to BUILDINFO', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
    dirs.length = 0
  })
  function seedOut(): string {
    const dir = mkdtempSync(join(tmpdir(), 'agf-scan-'))
    dirs.push(dir)
    writeFileSync(join(dir, 'BUILDINFO'), JSON.stringify({ version: '0.20.5', targets: TARGETS }))
    return dir
  }

  it('with no VT key → writes SCANINFO.json with virustotal null and verdict != flagged', async () => {
    const dir = seedOut()
    const info = await writeScanInfo(dir, { fetchVirusTotal: noKeyFetcher, scannedAt: '2026-07-03T00:00:00.000Z' })

    expect(existsSync(join(dir, 'SCANINFO.json'))).toBe(true)
    const written = JSON.parse(readFileSync(join(dir, 'SCANINFO.json'), 'utf8'))
    expect(written.verdict).not.toBe('flagged')
    expect(written.assets.every((a: { virustotal: unknown }) => a.virustotal === null)).toBe(true)
    expect(info.version).toBe('0.20.5')
  })

  it('when the VT fetch throws, SCANINFO.json still carries every sha256 (no crash)', async () => {
    const dir = seedOut()
    await writeScanInfo(dir, {
      fetchVirusTotal: async () => {
        throw new Error('VT timeout')
      },
      scannedAt: '2026-07-03T00:00:00.000Z',
    })
    const written = JSON.parse(readFileSync(join(dir, 'SCANINFO.json'), 'utf8'))
    expect(written.assets.map((a: { sha256: string }) => a.sha256)).toEqual(TARGETS.map((t) => t.sha256))
  })

  it('the written SCANINFO.json validates against the published schema', async () => {
    const dir = seedOut()
    await writeScanInfo(dir, { fetchVirusTotal: noKeyFetcher, scannedAt: '2026-07-03T00:00:00.000Z' })
    const written = JSON.parse(readFileSync(join(dir, 'SCANINFO.json'), 'utf8'))
    expect(() => scanInfoSchema.parse(written)).not.toThrow()
  })

  it('writes SCANINFO.json atomically via atomicJsonWrite — no leftover .tmp file (node_wire_4f0ea273afe7)', async () => {
    const dir = seedOut()
    const spy = vi.spyOn(atomicJsonWriteModule, 'atomicJsonWrite')
    await writeScanInfo(dir, { fetchVirusTotal: noKeyFetcher, scannedAt: '2026-07-03T00:00:00.000Z' })
    expect(spy).toHaveBeenCalledWith(join(dir, 'SCANINFO.json'), expect.any(Object))
    const entries = readdirSync(dir)
    expect(entries.some((f) => f.endsWith('.tmp'))).toBe(false)
    spy.mockRestore()
  })
})
