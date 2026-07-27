/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * release-consistency — pure release-integrity gate (no I/O): given a target
 * version and a way to read the version each published channel currently serves,
 * assert that EVERY OS/arch asset reports the same version. Motivation: a release is
 * assembled from several build jobs, so a stale binary survives when a target is not
 * rebuilt (e.g. a host-only pack that skips a cross-compiled target) or its upload
 * fails — leaving the site serving an old, wrong artifact for one channel while the
 * others are current.
 *
 * Scope note: since v0.24.0 Windows is NOT one of these channels. It ships as an npm
 * tarball installed on Node, which has no fixed asset name to version-compare, so it
 * is verified by the installer rather than by this gate.
 *
 * The fetch strategy is an injected port (DIP) so the core stays I/O-free and
 * testable; the deploy pipeline wires a real fetcher (per-asset version signal)
 * and uses `releaseConsistencyExitCode` as a post-upload gate.
 *
 * Composes with: upgrade.ts (reuses resolveAssetName for single-source asset names
 *               + compareVersions for semver equality). Consumer: the release/deploy
 *               step that must fail (exit != 0) when any channel diverges or is missing.
 */
import { resolveAssetName, compareVersions } from './upgrade.js'
import { UpgradeError } from './upgrade-error.js'

/**
 * The canonical set of published (node-platform, arch) targets — mirrors the build
 * matrix in scripts/bun-targets.mjs (ALL_TARGETS). Kept as (platform, arch) pairs so
 * the asset filename is derived through resolveAssetName (single source of naming),
 * never hand-duplicated.
 */
const PUBLISHED_TARGETS: ReadonlyArray<readonly [platform: string, arch: string]> = [
  ['darwin', 'arm64'],
  ['darwin', 'x64'],
  ['linux', 'x64'],
  ['linux', 'arm64'],
  // No ['win32','x64'] since v0.24.0 — Windows ships as an npm tarball, not a
  // binary channel, so there is no fixed asset for this gate to compare.
]

/** Fixed asset filenames served on the public channel, e.g. "agf-windows-x64.exe". */
export const PUBLISHED_ASSETS: readonly string[] = PUBLISHED_TARGETS.map(([platform, arch]) =>
  resolveAssetName(platform, arch),
)

/**
 * Reads the version string a given published asset currently serves.
 * Return `null` (or reject) when the asset is unreachable/absent — the gate treats
 * that channel as `missing` rather than crashing.
 */
export type ChannelVersionSource = (assetName: string) => Promise<string | null>

/** Per-channel outcome relative to the target version. */
export interface ChannelStatus {
  asset: string
  version: string | null
  status: 'match' | 'divergent' | 'missing'
}

export interface ReleaseConsistencyResult {
  ok: boolean
  target: string
  channels: ChannelStatus[]
  /** Asset names whose served version differs from the target. */
  divergent: string[]
  /** Asset names whose version could not be read (fetch failed / absent). */
  missing: string[]
}

/**
 * Assert every published channel serves `target`. Never throws for a single bad
 * channel — a rejected/null fetch is folded into `missing` so the gate can report
 * the full picture in one pass.
 */
export async function checkReleaseConsistency(
  target: string,
  fetchVersion: ChannelVersionSource,
  assets: readonly string[] = PUBLISHED_ASSETS,
): Promise<ReleaseConsistencyResult> {
  const channels: ChannelStatus[] = await Promise.all(
    assets.map(async (asset): Promise<ChannelStatus> => {
      let version: string | null
      try {
        version = await fetchVersion(asset)
      } catch {
        version = null
      }
      if (version === null) return { asset, version: null, status: 'missing' }
      const status = compareVersions(version, target) === 0 ? 'match' : 'divergent'
      return { asset, version, status }
    }),
  )

  const divergent = channels.filter((c) => c.status === 'divergent').map((c) => c.asset)
  const missing = channels.filter((c) => c.status === 'missing').map((c) => c.asset)
  return { ok: divergent.length === 0 && missing.length === 0, target, channels, divergent, missing }
}

/** Release-gate contract: 0 when the check passed, 1 otherwise (drives process exit). */
export function releaseConsistencyExitCode(result: { ok: boolean }): number {
  return result.ok ? 0 : 1
}

/**
 * The sha256 a given published asset ACTUALLY serves through the public CDN edge
 * (download the bytes, hash them). Return `null`/reject when the URL is unreachable.
 * This is the consumer-mode signal — the origin disk hash is NOT enough: a stale CDN
 * edge can serve an old binary while origin + BUILDINFO agree (see the 2026-07-03
 * windows incident: origin correct, Cloudflare edge served a 30-day-old .exe).
 */
export type ServedShaSource = (assetName: string) => Promise<string | null>

/** Per-channel outcome of the served-integrity check. */
export interface ServedChannelStatus {
  asset: string
  expected: string
  served: string | null
  status: 'match' | 'divergent' | 'missing'
}

export interface ServedIntegrityResult {
  ok: boolean
  channels: ServedChannelStatus[]
  /** Assets whose served sha256 differs from the published BUILDINFO (stale CDN edge). */
  divergent: string[]
  /** Assets whose served bytes could not be fetched. */
  missing: string[]
}

/**
 * Parse the authoritative asset→sha256 pairs out of a published BUILDINFO JSON
 * (the same shape pack-bun.mjs writes: `targets[].out` + `targets[].sha256`).
 * Feeds `checkServedIntegrity` with what the release SHOULD serve.
 */
export function parseExpectedShas(buildInfoJson: string): Array<{ asset: string; sha256: string }> {
  const parsed = JSON.parse(buildInfoJson) as { targets?: Array<{ out?: string; sha256?: string }> }
  if (!Array.isArray(parsed.targets) || parsed.targets.length === 0) {
    throw new UpgradeError('BUILDINFO has no targets[] to derive expected shas from')
  }
  return parsed.targets.map((t) => {
    if (!t.out || !t.sha256) throw new UpgradeError(`BUILDINFO target missing out/sha256: ${JSON.stringify(t)}`)
    return { asset: t.out, sha256: t.sha256 }
  })
}

/**
 * Consumer-mode gate: assert the sha256 each asset ACTUALLY serves via HTTPS matches
 * what BUILDINFO claims. Catches the CDN-edge-stale failure mode that an origin-only
 * check is blind to. Never throws per channel — a failed fetch folds into `missing`.
 */
export async function checkServedIntegrity(
  expected: ReadonlyArray<{ asset: string; sha256: string }>,
  fetchServedSha: ServedShaSource,
): Promise<ServedIntegrityResult> {
  const channels: ServedChannelStatus[] = await Promise.all(
    expected.map(async ({ asset, sha256 }): Promise<ServedChannelStatus> => {
      let served: string | null
      try {
        served = await fetchServedSha(asset)
      } catch {
        served = null
      }
      if (served === null) return { asset, expected: sha256, served: null, status: 'missing' }
      return { asset, expected: sha256, served, status: served === sha256 ? 'match' : 'divergent' }
    }),
  )

  const divergent = channels.filter((c) => c.status === 'divergent').map((c) => c.asset)
  const missing = channels.filter((c) => c.status === 'missing').map((c) => c.asset)
  return { ok: divergent.length === 0 && missing.length === 0, channels, divergent, missing }
}
