/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * upgrade — pure self-update logic (no I/O): map the running platform to its
 * fixed release asset name, compare semver, and decide whether to upgrade.
 *
 * Assets are served from the project's own release channel under FIXED names (no
 * version in the filename), so a binary always pulls "latest" for its OS/arch.
 * Override with AGF_RELEASES_BASE — a mirror, an air-gapped copy, or GitHub.
 *
 * PRIVACY, stated plainly: this fetch reaches a host the author operates, so it
 * discloses your IP and the version you run. That is the ONLY such request agf
 * makes, it happens exactly when you type `agf upgrade`, and never otherwise —
 * no startup check, no background refresh, no fingerprint. The release host is
 * configured to keep no access log for /releases/ and stores no download record.
 * Verify the "never otherwise" half yourself: src/tests/local-first-no-network.ts
 * fails the build if any other module reaches this host.
 *
 * Composes with: upgrade-runner.ts (orchestration + injected ports),
 *               cli/commands/upgrade-cmd.ts (real fetch/fs wiring).
 */
import { UpgradeError } from './upgrade-error.js'

/** Public download base for release assets + BUILDINFO (GitHub Releases, `latest`). */
export const RELEASES_BASE = process.env.AGF_RELEASES_BASE ?? 'https://graph-flow.cloud/releases'

const OS_IDS: Record<string, string> = { darwin: 'darwin', linux: 'linux', win32: 'windows' }
const ARCH_IDS: Record<string, string> = { arm64: 'arm64', x64: 'x64' }

/** Fixed release asset name for a platform/arch, e.g. "agf-darwin-arm64" / "agf-windows-x64.exe". */
export function resolveAssetName(platform: string, arch: string): string {
  const os = OS_IDS[platform]
  const cpu = ARCH_IDS[arch]
  if (!os) throw new UpgradeError(`Unsupported platform for self-update: ${platform}`)
  if (!cpu) throw new UpgradeError(`Unsupported architecture for self-update: ${arch}`)
  // No windows-arm64 binary is published — guard explicitly.
  if (os === 'windows' && cpu !== 'x64') throw new UpgradeError(`No published binary for windows-${cpu}`)
  const ext = os === 'windows' ? '.exe' : ''
  return `agf-${os}-${cpu}${ext}`
}

/** Numeric semver compare (major.minor.patch); >0 if a>b, <0 if a<b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  // Strip a leading v/V: GitHub release tags (vX.Y.Z), process.version and other release
  // systems use it. Without this, parseInt('v1') is NaN → 0, flipping 1.0.0 below 0.9.0.
  const strip = (v: string): string => v.replace(/^[vV]/, '')
  const pa = strip(a)
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
  const pb = strip(b)
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

export interface UpgradePlanInput {
  current: string
  remote: string
  force?: boolean
}

export interface UpgradePlan {
  shouldUpgrade: boolean
  reason: string
}

/** Decide whether to upgrade: only when remote is strictly newer, unless forced. */
export function planUpgrade({ current, remote, force }: UpgradePlanInput): UpgradePlan {
  if (force) return { shouldUpgrade: true, reason: `forced re-install of v${remote}` }
  const cmp = compareVersions(remote, current)
  if (cmp > 0) return { shouldUpgrade: true, reason: `v${current} → v${remote}` }
  if (cmp === 0) return { shouldUpgrade: false, reason: `already up to date (v${current})` }
  return { shouldUpgrade: false, reason: `installed v${current} is newer than published v${remote}` }
}
