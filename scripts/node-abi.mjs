/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node-abi — the Node major ↔ V8 module ABI table the Windows offline tarballs
 * are built and named from.
 *
 * WHY this is a module and not a constant inside pack-offline.mjs: three
 * callers must agree on it or the channel breaks silently — `pack-offline.mjs`
 * (names the tarball), `gen-packages.sh` (decides how many to build), and the
 * published `install.ps1` (picks one for the user's Node). A second copy is a
 * mislabelled tarball waiting to happen.
 *
 * The trap being defended against: the bundled `better-sqlite3` is compiled
 * against exactly ONE ABI, and `pack-offline.mjs` defaults `--target-abi` to
 * the BUILD HOST's. Building Windows on a Node 24 machine therefore yields a
 * tarball that installs cleanly and then cannot load SQLite on the Node 20/22
 * LTS corporate fleets standardise on — a failure that lands *after* a
 * "successful" install, where it is hardest to diagnose.
 *
 * Contract: the filename tag is always derived from the ABI actually baked in,
 * never passed in alongside it, so the label cannot drift from the payload.
 */

/**
 * @typedef {{ major: number, abi: number }} NodeAbiTarget
 */

/**
 * Node lines the Windows tarball is published for, with the V8 module ABI
 * (`process.versions.modules`) each one reports.
 *
 * This list is NOT a preference — it is bounded by which prebuilt
 * `better-sqlite3` binaries actually exist. Verified against the upstream
 * release assets (`WiseLibs/better-sqlite3` v12.11.1 publishes win32-x64 for
 * ABI 127/137/141/147 only) and against nodejs.org's release index for the
 * ABI→major mapping. Adding a line with no upstream prebuild does not widen
 * support: `pack-offline.mjs` 404s and the Windows build fails outright.
 *
 *   - Node 20 (ABI 115): absent. End-of-life since April 2026, upstream stopped
 *     publishing win32 prebuilds for it. This is the entry most likely to be
 *     "restored" by someone reading `engines: node >= 20` in package.json —
 *     don't; it breaks the build rather than helping anyone.
 *   - Node 21/23/25/26: not LTS. Corporate fleets — the entire audience for this
 *     channel — standardise on LTS, and each extra tarball costs ~366 MB on the
 *     release server. Refused explicitly by `nodeMajorForAbi`.
 *
 * @type {ReadonlyArray<NodeAbiTarget>}
 */
export const WINDOWS_TARBALL_TARGETS = [
  { major: 22, abi: 127 },
  { major: 24, abi: 137 },
]

/**
 * Node major for a V8 module ABI. Accepts the string form because that is what
 * `process.versions.modules` actually returns.
 *
 * Throws rather than returning undefined: a caller that fell through would name
 * a file `-nodeundefined`, and a mislabelled tarball is worse than a missing one
 * — the installer would hand a user a binary built for a different ABI.
 *
 * @param {number|string} abi
 * @returns {number}
 */
export function nodeMajorForAbi(abi) {
  const numeric = typeof abi === 'string' ? Number.parseInt(abi, 10) : abi
  const match = WINDOWS_TARBALL_TARGETS.find((t) => t.abi === numeric)
  if (!match) {
    const supported = WINDOWS_TARBALL_TARGETS.map((t) => `${t.abi} (Node ${t.major})`).join(', ')
    throw new Error(`Unsupported Node ABI ${abi} — no tarball is published for it. Supported: ${supported}`)
  }
  return match.major
}

/**
 * Filename tag for a tarball carrying a binary built against `abi`,
 * e.g. 137 → "node24" → `agf-offline-win32-x64-<version>-node24.tgz`.
 *
 * @param {number|string} abi
 * @returns {string}
 */
export function abiTagForAbi(abi) {
  return `node${nodeMajorForAbi(abi)}`
}
