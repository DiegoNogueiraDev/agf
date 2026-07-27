/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * codesign-darwin — re-apply an ad-hoc code signature to a compiled darwin
 * `agf` binary.
 *
 * WHY: `bun build --compile` appends the JS bundle to the Mach-O AFTER the
 * linker writes its own ad-hoc signature, which INVALIDATES it. `codesign
 * --verify` then fails and macOS rejects the binary as "damaged" ("está
 * danificado") — fatal on arm64, where a valid signature is mandatory to exec.
 * Re-signing ad-hoc (`codesign --sign -`) is free (no Developer ID, no
 * notarization) and yields a valid signature, enough for a binary the user
 * downloads + installs via the bundled script.
 *
 * Owns ONLY the signing concern; `scripts/pack-bun.mjs` calls this after a
 * successful darwin compile. SQLite needs no native `.node` in the binary —
 * the compiled runtime uses `bun:sqlite` (see core/store/database-factory.ts).
 */
import { spawnSync } from 'node:child_process'

/**
 * @typedef {{ applied: boolean, reason?: string }} SignResult
 */

/**
 * Re-apply an ad-hoc signature to a darwin binary. No-ops (without error) when
 * the target is not darwin or the build host is not macOS — `codesign` ships
 * only with macOS, so a darwin target cross-built on Linux can't be re-signed
 * locally and the caller should warn.
 *
 * @param {string} binPath - path to the compiled binary
 * @param {{ targetOs?: string, hostPlatform?: string }} [opts]
 * @returns {SignResult}
 */
export function signDarwinAdhoc(binPath, { targetOs, hostPlatform = process.platform } = {}) {
  if (targetOs !== 'darwin') return { applied: false, reason: 'not-darwin' }
  if (hostPlatform !== 'darwin') return { applied: false, reason: 'host-not-macos' }
  const r = spawnSync('codesign', ['--sign', '-', '--force', binPath], { encoding: 'utf-8' })
  if (r.status !== 0) {
    return { applied: false, reason: `codesign-failed: ${(r.stderr ?? '').trim()}` }
  }
  return { applied: true }
}
