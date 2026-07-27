/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * upgrade-runner — orchestrates `agf upgrade` over injected ports (DIP), so the
 * decision + verify flow is fully testable without network or touching the real
 * binary. Flow: read remote BUILDINFO version → planUpgrade → download asset +
 * .sha256 → verify checksum → swap the running binary. NEVER swaps on a checksum
 * mismatch (tamper/corruption guard).
 *
 * Composes with: upgrade.ts (pure logic), cli/commands/upgrade-cmd.ts (real ports).
 */
import { createHash } from 'node:crypto'
import { RELEASES_BASE, resolveAssetName, planUpgrade } from './upgrade.js'
import { UpgradeError } from './upgrade-error.js'

/** Injectable I/O surface — real impls in upgrade-cmd.ts, stubs in tests. */
export interface UpgradePorts {
  platform: string
  arch: string
  currentVersion: string
  /** Absolute path of the running binary to replace. */
  execPath: string
  fetchText(url: string): Promise<string>
  fetchBinary(url: string): Promise<Buffer>
  /** Atomically replace the binary at `dest` with `bytes` (+x, rename-over). */
  swapBinary(dest: string, bytes: Buffer): Promise<void>
  force?: boolean
}

export interface UpgradeResult {
  ok: boolean
  upgraded: boolean
  from: string
  to: string
  asset?: string
  reason?: string
  code?: string
  error?: string
}

/** Parse the version out of the releases BUILDINFO JSON. */
export function remoteVersionFrom(buildInfoJson: string): string {
  const parsed = JSON.parse(buildInfoJson) as { version?: string }
  if (!parsed.version) throw new UpgradeError('BUILDINFO missing version')
  return parsed.version
}

/** First whitespace-delimited token of a `sha256  filename` line. */
function expectedSumFrom(shaLine: string): string {
  return shaLine.trim().split(/\s+/)[0] ?? ''
}

export async function runUpgrade(ports: UpgradePorts): Promise<UpgradeResult> {
  const from = ports.currentVersion
  let asset: string
  try {
    asset = resolveAssetName(ports.platform, ports.arch)
  } catch (e) {
    return { ok: false, upgraded: false, from, to: from, code: 'UNSUPPORTED_PLATFORM', error: (e as Error).message }
  }

  let remote: string
  try {
    remote = remoteVersionFrom(await ports.fetchText(`${RELEASES_BASE}/BUILDINFO`))
  } catch (e) {
    return { ok: false, upgraded: false, from, to: from, code: 'BUILDINFO_UNAVAILABLE', error: (e as Error).message }
  }

  const plan = planUpgrade({ current: from, remote, force: ports.force })
  if (!plan.shouldUpgrade) {
    return { ok: true, upgraded: false, from, to: remote, asset, reason: plan.reason }
  }

  const url = `${RELEASES_BASE}/${asset}`
  let bytes: Buffer
  let expected: string
  try {
    ;[bytes, expected] = await Promise.all([
      ports.fetchBinary(url),
      ports.fetchText(`${url}.sha256`).then(expectedSumFrom),
    ])
  } catch (e) {
    return { ok: false, upgraded: false, from, to: remote, asset, code: 'DOWNLOAD_FAILED', error: (e as Error).message }
  }

  const actual = createHash('sha256').update(bytes).digest('hex')
  if (!expected || actual !== expected) {
    return {
      ok: false,
      upgraded: false,
      from,
      to: remote,
      asset,
      code: 'CHECKSUM_MISMATCH',
      error: `expected ${expected || '(none)'}, got ${actual}`,
    }
  }

  try {
    await ports.swapBinary(ports.execPath, bytes)
  } catch (e) {
    return { ok: false, upgraded: false, from, to: remote, asset, code: 'SWAP_FAILED', error: (e as Error).message }
  }

  return { ok: true, upgraded: true, from, to: remote, asset, reason: plan.reason }
}
