/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import {
  checkReleaseConsistency,
  checkServedIntegrity,
  parseExpectedShas,
  releaseConsistencyExitCode,
  PUBLISHED_ASSETS,
  type ChannelVersionSource,
  type ServedShaSource,
} from '../core/upgrade/release-consistency.js'
import { UpgradeError } from '../core/upgrade/upgrade-error.js'

/** Build a stub fetcher from an asset→version map; unknown assets resolve to null (missing). */
function stubVersions(map: Record<string, string | null>): ChannelVersionSource {
  return async (asset: string) => (asset in map ? map[asset] : null)
}

describe('checkReleaseConsistency', () => {
  it('flags a stale channel as divergent (0.20.4 vs target 0.20.5)', async () => {
    const target = '0.20.5'
    const fetch = stubVersions({
      'agf-darwin-arm64': '0.20.5',
      'agf-darwin-x64': '0.20.5',
      'agf-linux-x64': '0.20.4', // one runner failed to rebuild/upload
      'agf-linux-arm64': '0.20.5',
    })

    const result = await checkReleaseConsistency(target, fetch)

    expect(result.ok).toBe(false)
    expect(result.divergent).toEqual(['agf-linux-x64'])
    expect(result.missing).toEqual([])
  })

  it('returns ok=true when every channel matches the target version', async () => {
    const target = '0.20.5'
    const fetch = stubVersions(Object.fromEntries(PUBLISHED_ASSETS.map((a) => [a, '0.20.5'])))

    const result = await checkReleaseConsistency(target, fetch)

    expect(result.ok).toBe(true)
    expect(result.divergent).toEqual([])
    expect(result.missing).toEqual([])
    expect(result.channels).toHaveLength(PUBLISHED_ASSETS.length)
  })

  it('marks a channel missing (not throwing) when its fetch yields null', async () => {
    const target = '0.20.5'
    const fetch = stubVersions({
      'agf-darwin-arm64': '0.20.5',
      'agf-darwin-x64': '0.20.5',
      'agf-linux-x64': '0.20.5',
      'agf-linux-arm64': null, // fetch failed / asset absent
    })

    const result = await checkReleaseConsistency(target, fetch)

    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(['agf-linux-arm64'])
    expect(result.channels.find((c) => c.asset === 'agf-linux-arm64')?.status).toBe('missing')
  })

  it('does not throw when the fetcher itself rejects — treats the channel as missing', async () => {
    const target = '0.20.5'
    const fetch: ChannelVersionSource = async (asset) => {
      if (asset === 'agf-linux-arm64') throw new Error('network down')
      return '0.20.5'
    }

    const result = await checkReleaseConsistency(target, fetch)

    expect(result.ok).toBe(false)
    expect(result.missing).toContain('agf-linux-arm64')
  })

  it('exposes the exact published asset set', () => {
    expect(PUBLISHED_ASSETS).toContain('agf-darwin-arm64')
    expect(PUBLISHED_ASSETS).toContain('agf-linux-arm64')
    expect(PUBLISHED_ASSETS).toHaveLength(4)
  })

  // The gate decides which channels a release must serve. Leaving Windows in it
  // after 0.24.0 would demand an artifact we deliberately stopped publishing —
  // the gate would fail every release, and the honest fix would look like
  // "silence the gate" rather than "the channel is gone".
  it('no longer demands a Windows channel', () => {
    expect(PUBLISHED_ASSETS.some((a) => a.includes('windows') || a.endsWith('.exe'))).toBe(false)
  })
})

describe('releaseConsistencyExitCode', () => {
  it('returns 0 when ok=true and non-zero when ok=false (release-gate contract)', () => {
    expect(releaseConsistencyExitCode({ ok: true, target: '0.20.5', channels: [], divergent: [], missing: [] })).toBe(0)
    expect(
      releaseConsistencyExitCode({
        ok: false,
        target: '0.20.5',
        channels: [],
        divergent: ['agf-linux-x64'],
        missing: [],
      }),
    ).not.toBe(0)
  })

  it('also drives the exit code from a served-integrity result (shared contract)', () => {
    expect(releaseConsistencyExitCode({ ok: true })).toBe(0)
    expect(releaseConsistencyExitCode({ ok: false })).not.toBe(0)
  })
})

/** BUILDINFO fixture mirroring the real pack-bun.mjs output shape. */
const BUILDINFO_FIXTURE = JSON.stringify({
  version: '0.20.5',
  targets: [
    { out: 'agf-darwin-arm64', sha256: 'aaa' },
    { out: 'agf-linux-x64', sha256: 'bbb' },
  ],
})

describe('parseExpectedShas', () => {
  it('extracts asset→sha256 pairs from BUILDINFO targets', () => {
    expect(parseExpectedShas(BUILDINFO_FIXTURE)).toEqual([
      { asset: 'agf-darwin-arm64', sha256: 'aaa' },
      { asset: 'agf-linux-x64', sha256: 'bbb' },
    ])
  })

  it('throws a typed UpgradeError on malformed BUILDINFO (no targets)', () => {
    expect(() => parseExpectedShas('{"version":"0.20.5"}')).toThrow(UpgradeError)
  })

  it('throws a typed UpgradeError when a target is missing out/sha256', () => {
    expect(() => parseExpectedShas('{"targets":[{"out":"agf-linux-x64"}]}')).toThrow(UpgradeError)
  })
})

/** Stub a served-sha fetcher from an asset→sha map; unknown assets → null (missing). */
function stubServedShas(map: Record<string, string | null>): ServedShaSource {
  return async (asset: string) => (asset in map ? map[asset] : null)
}

describe('checkServedIntegrity (consumer-mode: HTTPS-served bytes vs BUILDINFO)', () => {
  const expected = [
    { asset: 'agf-linux-x64', sha256: '2bb210f6' },
    { asset: 'agf-darwin-arm64', sha256: '47b98256' },
  ]

  it('flags the CDN-stale channel when the served sha differs from BUILDINFO', async () => {
    const fetch = stubServedShas({ 'agf-linux-x64': 'deadbeef', 'agf-darwin-arm64': '47b98256' })

    const result = await checkServedIntegrity(expected, fetch)

    expect(result.ok).toBe(false)
    expect(result.divergent).toEqual(['agf-linux-x64'])
    expect(result.missing).toEqual([])
  })

  it('returns ok=true when every served sha matches BUILDINFO', async () => {
    const fetch = stubServedShas({ 'agf-linux-x64': '2bb210f6', 'agf-darwin-arm64': '47b98256' })

    const result = await checkServedIntegrity(expected, fetch)

    expect(result.ok).toBe(true)
    expect(releaseConsistencyExitCode(result)).toBe(0)
  })

  it('marks a channel missing (no throw) when the HTTPS fetch fails/rejects', async () => {
    const fetch: ServedShaSource = async (asset) => {
      if (asset === 'agf-linux-x64') throw new Error('CDN 5xx')
      return '47b98256'
    }

    const result = await checkServedIntegrity(expected, fetch)

    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(['agf-linux-x64'])
  })
})
