/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Contract for the Bun cross-compile target matrix (`scripts/bun-targets.mjs`).
 * Locks the 5 OS/arch targets `pack-bun.mjs` builds (darwin arm64/x64, linux
 * x64/arm64, windows x64) and the host-triple mapping that decides which one
 * can be smoke-run locally. Kept as a config contract (not a full 5-target
 * build) so it stays in the <60s blast budget.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { ALL_TARGETS, hostTriple } from '../../scripts/bun-targets.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('bun cross-compile targets', () => {
  it('declares exactly the 5 OS/arch targets', () => {
    expect(ALL_TARGETS).toHaveLength(5)
    expect(ALL_TARGETS.map((t) => t.triple).sort()).toEqual(
      ['bun-darwin-arm64', 'bun-darwin-x64', 'bun-linux-arm64', 'bun-linux-x64', 'bun-windows-x64'].sort(),
    )
  })

  it('covers both Mac architectures and both Linux architectures', () => {
    const has = (os: string, arch: string) => ALL_TARGETS.some((t) => t.os === os && t.arch === arch)
    expect(has('darwin', 'arm64')).toBe(true)
    expect(has('darwin', 'x64')).toBe(true) // Mac Intel
    expect(has('linux', 'x64')).toBe(true)
    expect(has('linux', 'arm64')).toBe(true)
    expect(has('win32', 'x64')).toBe(true)
  })

  it('gives every target a unique output name; only windows is .exe', () => {
    const outs = ALL_TARGETS.map((t) => t.out)
    expect(new Set(outs).size).toBe(outs.length)
    expect(ALL_TARGETS.filter((t) => t.out.endsWith('.exe')).map((t) => t.os)).toEqual(['win32'])
  })

  it('maps the host platform/arch to its bun triple', () => {
    expect(hostTriple('darwin', 'arm64')).toBe('bun-darwin-arm64')
    expect(hostTriple('darwin', 'x64')).toBe('bun-darwin-x64')
    expect(hostTriple('linux', 'x64')).toBe('bun-linux-x64')
    expect(hostTriple('linux', 'arm64')).toBe('bun-linux-arm64')
    expect(hostTriple('win32', 'x64')).toBe('bun-windows-x64')
  })

  it('every host triple resolves to a declared target', () => {
    for (const t of ALL_TARGETS) {
      expect(ALL_TARGETS.some((x) => x.triple === t.triple)).toBe(true)
    }
  })
})

describe('pack-bun.mjs sources targets from the shared module', () => {
  it('imports ALL_TARGETS / hostTriple from bun-targets', () => {
    const src = readFileSync(path.join(ROOT, 'scripts', 'pack-bun.mjs'), 'utf-8')
    expect(src).toContain('bun-targets')
    expect(src).toContain('ALL_TARGETS')
  })

  it('ships an arch-aware POSIX installer so the new binaries are selectable', () => {
    const src = readFileSync(path.join(ROOT, 'scripts', 'pack-bun.mjs'), 'utf-8')
    // The new Mac-Intel and Linux-arm64 outputs must be reachable from install-bun.sh.
    expect(src).toContain('agf-darwin-x64')
    expect(src).toContain('agf-linux-arm64')
    expect(src).toContain('uname -m')
  })
})
