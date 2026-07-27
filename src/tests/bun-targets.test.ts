/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Contract for the Bun cross-compile target matrix (`scripts/bun-targets.mjs`).
 * Locks the 4 OS/arch targets `pack-bun.mjs` builds (darwin arm64/x64, linux
 * x64/arm64) and the host-triple mapping that decides which one can be
 * smoke-run locally. Kept as a config contract (not a full build) so it stays
 * in the <60s blast budget.
 *
 * v0.24.0 retired `bun-windows-x64`: a standalone unsigned `.exe` served from
 * our own domain is the exact signature corporate EDR/AppLocker blocks, so
 * Windows ships as an npm tarball installed on Node instead. `hostTriple`
 * still maps win32 — it identifies the build HOST, which is a separate
 * question from what we publish.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { ALL_TARGETS, hostTriple } from '../../scripts/bun-targets.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('bun cross-compile targets', () => {
  it('declares exactly the 4 OS/arch targets', () => {
    expect(ALL_TARGETS).toHaveLength(4)
    expect(ALL_TARGETS.map((t) => t.triple).sort()).toEqual(
      ['bun-darwin-arm64', 'bun-darwin-x64', 'bun-linux-arm64', 'bun-linux-x64'].sort(),
    )
  })

  it('covers both Mac architectures and both Linux architectures', () => {
    const has = (os: string, arch: string) => ALL_TARGETS.some((t) => t.os === os && t.arch === arch)
    expect(has('darwin', 'arm64')).toBe(true)
    expect(has('darwin', 'x64')).toBe(true) // Mac Intel
    expect(has('linux', 'x64')).toBe(true)
    expect(has('linux', 'arm64')).toBe(true)
  })

  // The regression this guards is a re-added Windows target quietly restoring
  // the .exe channel — the artifact corporate security blocks. Asserted on the
  // matrix (not on a build) so it fails at the source of truth.
  it('publishes no Windows target and no .exe artifact', () => {
    expect(ALL_TARGETS.some((t) => t.os === 'win32')).toBe(false)
    expect(ALL_TARGETS.filter((t) => t.out.endsWith('.exe'))).toEqual([])
  })

  it('gives every target a unique output name', () => {
    const outs = ALL_TARGETS.map((t) => t.out)
    expect(new Set(outs).size).toBe(outs.length)
  })

  it('maps the host platform/arch to its bun triple', () => {
    expect(hostTriple('darwin', 'arm64')).toBe('bun-darwin-arm64')
    expect(hostTriple('darwin', 'x64')).toBe('bun-darwin-x64')
    expect(hostTriple('linux', 'x64')).toBe('bun-linux-x64')
    expect(hostTriple('linux', 'arm64')).toBe('bun-linux-arm64')
    expect(hostTriple('win32', 'x64')).toBe('bun-windows-x64')
  })

  it('round-trips every declared target through hostTriple', () => {
    for (const t of ALL_TARGETS) {
      expect(hostTriple(t.os, t.arch)).toBe(t.triple)
    }
  })

  // hostTriple answers "what am I building ON", ALL_TARGETS answers "what do we
  // ship". Since v0.24.0 those diverge for Windows, and conflating them is what
  // would silently resurrect the .exe — so the gap is asserted, not assumed.
  it('maps a Windows host to a triple that is deliberately not published', () => {
    expect(hostTriple('win32', 'x64')).toBe('bun-windows-x64')
    expect(ALL_TARGETS.some((t) => t.triple === hostTriple('win32', 'x64'))).toBe(false)
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
