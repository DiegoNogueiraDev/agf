/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { buildScanInfo } from '../core/upgrade/scan-info.js'
import { scanInfoSchema, type ScanAsset } from '../schemas/scan-info.js'

function asset(over: Partial<ScanAsset> = {}): ScanAsset {
  return {
    name: 'agf-darwin-arm64',
    sha256: 'a'.repeat(64),
    signature: 'signed',
    virustotal: { flagged: 0, total: 72, permalink: 'https://vt/x' },
    ...over,
  }
}

const SCANNED_AT = '2026-07-03T18:00:00.000Z'

describe('buildScanInfo — verdict aggregation', () => {
  it("verdict='clean' when every asset has sha256 and virustotal.flagged=0", () => {
    const info = buildScanInfo({
      version: '0.20.5',
      scannedAt: SCANNED_AT,
      assets: [asset({ name: 'agf-darwin-arm64' }), asset({ name: 'agf-windows-x64.exe' })],
    })
    expect(info.verdict).toBe('clean')
    expect(info.version).toBe('0.20.5')
    expect(info.scannedAt).toBe(SCANNED_AT)
  })

  it("verdict='flagged' when any asset has virustotal.flagged>0", () => {
    const info = buildScanInfo({
      version: '0.20.5',
      scannedAt: SCANNED_AT,
      assets: [asset(), asset({ name: 'agf-windows-x64.exe', virustotal: { flagged: 3, total: 72, permalink: 'x' } })],
    })
    expect(info.verdict).toBe('flagged')
  })

  it("verdict='unknown' when any asset is missing sha256", () => {
    const info = buildScanInfo({
      version: '0.20.5',
      scannedAt: SCANNED_AT,
      assets: [asset(), asset({ name: 'agf-linux-x64', sha256: '' })],
    })
    expect(info.verdict).toBe('unknown')
  })

  it("verdict='clean' when virustotal is null but every asset has sha256 (fail-open to checksum/signature)", () => {
    const info = buildScanInfo({
      version: '0.20.5',
      scannedAt: SCANNED_AT,
      assets: [asset({ virustotal: null }), asset({ name: 'agf-windows-x64.exe', virustotal: null })],
    })
    expect(info.verdict).toBe('clean')
  })

  it("a detected virus wins over a missing sha256 (flagged is never hidden behind 'unknown')", () => {
    const info = buildScanInfo({
      version: '0.20.5',
      scannedAt: SCANNED_AT,
      assets: [
        asset({ name: 'agf-linux-x64', sha256: '' }),
        asset({ name: 'agf-windows-x64.exe', virustotal: { flagged: 1, total: 72, permalink: 'x' } }),
      ],
    })
    expect(info.verdict).toBe('flagged')
  })

  it('produces output that satisfies the published SCANINFO schema', () => {
    const info = buildScanInfo({ version: '0.20.5', scannedAt: SCANNED_AT, assets: [asset()] })
    expect(() => scanInfoSchema.parse(info)).not.toThrow()
  })
})

describe('scanInfoSchema — boundary validation', () => {
  it('rejects an unknown verdict value', () => {
    const info = buildScanInfo({ version: '0.20.5', scannedAt: SCANNED_AT, assets: [asset()] })
    expect(() => scanInfoSchema.parse({ ...info, verdict: 'bogus' })).toThrow()
  })

  it('accepts a nullable virustotal field', () => {
    const info = buildScanInfo({ version: '0.20.5', scannedAt: SCANNED_AT, assets: [asset({ virustotal: null })] })
    expect(() => scanInfoSchema.parse(info)).not.toThrow()
  })
})
