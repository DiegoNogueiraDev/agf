/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * bun-targets — the OS/arch matrix `scripts/pack-bun.mjs` cross-compiles with
 * `bun build --compile --target=<triple>`. One host (any of these) builds all
 * five standalone binaries; SQLite is `bun:sqlite` so no native `.node` per
 * arch is needed (see core/store/database-factory.ts).
 *
 * Extracted from pack-bun.mjs so the target matrix is unit-testable without
 * triggering a real build (importing pack-bun.mjs runs its `main()`).
 */

/**
 * @typedef {{ triple: string, out: string, os: 'darwin'|'linux'|'win32', arch: 'arm64'|'x64' }} BunTarget
 */

/** @type {BunTarget[]} */
export const ALL_TARGETS = [
  { triple: 'bun-darwin-arm64', out: 'agf-darwin-arm64', os: 'darwin', arch: 'arm64' },
  { triple: 'bun-darwin-x64', out: 'agf-darwin-x64', os: 'darwin', arch: 'x64' },
  { triple: 'bun-linux-x64', out: 'agf-linux-x64', os: 'linux', arch: 'x64' },
  { triple: 'bun-linux-arm64', out: 'agf-linux-arm64', os: 'linux', arch: 'arm64' },
  { triple: 'bun-windows-x64', out: 'agf-windows-x64.exe', os: 'win32', arch: 'x64' },
]

/**
 * The bun triple for the current build host — the only target that can be
 * executed (and thus version-checked) locally after compiling.
 *
 * @param {NodeJS.Platform} [platform]
 * @param {string} [arch]
 * @returns {string}
 */
export function hostTriple(platform = process.platform, arch = process.arch) {
  const os = { darwin: 'darwin', linux: 'linux', win32: 'windows' }[platform] ?? platform
  const a = arch === 'arm64' ? 'arm64' : 'x64'
  return `bun-${os}-${a}`
}
