/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Contract for the Node major ↔ V8 module ABI table that names the Windows
 * offline tarballs (`scripts/node-abi.mjs`).
 *
 * Why this exists: the bundled `better-sqlite3` binary is compiled against ONE
 * ABI. `pack-offline.mjs` defaults `--target-abi` to the BUILD HOST's ABI, so a
 * naive Windows build on a Node 24 machine produces a tarball that installs
 * cleanly and then fails to load SQLite on the Node 20/22 LTS that corporate
 * fleets standardise on. The failure surfaces after a "successful" install,
 * which is the worst place for it — hence one tarball per supported ABI, named
 * from the ABI actually baked in.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path, { join } from 'node:path'
import { WINDOWS_TARBALL_TARGETS, nodeMajorForAbi, abiTagForAbi } from '../../scripts/node-abi.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('WINDOWS_TARBALL_TARGETS', () => {
  it('covers the active Node LTS lines with their real V8 module ABIs', () => {
    expect(WINDOWS_TARBALL_TARGETS).toEqual([
      { major: 22, abi: 127 },
      { major: 24, abi: 137 },
    ])
  })

  // Node 20 (ABI 115) is absent on purpose and this is the one entry people will
  // try to "restore": it reached end-of-life in April 2026, so better-sqlite3
  // publishes no win32 prebuild for it and the build 404s. Listing it would not
  // widen support — it would break the whole Windows build.
  it('does not claim the end-of-life Node 20 line', () => {
    expect(WINDOWS_TARBALL_TARGETS.some((t) => t.major === 20 || t.abi === 115)).toBe(false)
  })

  it('maps every major to a distinct ABI (a collision would silently overwrite a tarball)', () => {
    const abis = WINDOWS_TARBALL_TARGETS.map((t) => t.abi)
    const majors = WINDOWS_TARBALL_TARGETS.map((t) => t.major)
    expect(new Set(abis).size).toBe(abis.length)
    expect(new Set(majors).size).toBe(majors.length)
  })
})

describe('nodeMajorForAbi', () => {
  it('resolves each supported ABI to its Node major', () => {
    expect(nodeMajorForAbi(127)).toBe(22)
    expect(nodeMajorForAbi(137)).toBe(24)
  })

  it('accepts the string form process.versions.modules actually returns', () => {
    expect(nodeMajorForAbi('137')).toBe(24)
  })

  // Refusing beats guessing: an unknown ABI that fell through would name the
  // file `-nodeundefined`, and a mislabelled tarball is worse than a missing
  // one — the installer would hand a Node 23 user a binary for another ABI.
  it('throws on an unmapped ABI instead of producing an undefined tag', () => {
    expect(() => nodeMajorForAbi(131)).toThrow(/ABI 131/)
    expect(() => nodeMajorForAbi(115)).toThrow() // Node 20, EOL — no prebuild exists
    expect(() => nodeMajorForAbi(999)).toThrow()
  })
})

// The regression guarded here is the one that survives a fully green build:
// gen-packages.sh building Windows ONCE (host ABI only) while the site offers a
// single tarball to every Node version. Nothing fails at build time — it fails
// on the user's machine, after install. So the wiring is asserted at the source.
describe('gen-packages.sh drives Windows builds from this table', () => {
  const script = readFileSync(join(ROOT, 'scripts', 'gen-packages.sh'), 'utf8')

  it('reads the ABI list from node-abi.mjs rather than hardcoding its own', () => {
    expect(script).toMatch(/node-abi\.mjs/)
    expect(script).toMatch(/WINDOWS_TARBALL_TARGETS/)
  })

  it('passes --target-abi per ABI instead of building win32 a single time', () => {
    expect(script).toMatch(/--target-abi/)
    expect(script).toMatch(/for abi in/)
    // The old single-shot call is what shipped the host-ABI-only tarball.
    expect(script).not.toMatch(/build_target win32 x64/)
  })
})

describe('abiTagForAbi', () => {
  it('builds the filename tag from the ABI that is actually baked in', () => {
    expect(abiTagForAbi(127)).toBe('node22')
    expect(abiTagForAbi(137)).toBe('node24')
  })

  it('gives every supported target a unique tarball name', () => {
    const names = WINDOWS_TARBALL_TARGETS.map((t) => `agf-offline-win32-x64-1.2.3-${abiTagForAbi(t.abi)}.tgz`)
    expect(new Set(names).size).toBe(names.length)
  })
})
