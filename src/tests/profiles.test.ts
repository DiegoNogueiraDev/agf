/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_a81a478e2dc8 — profiles: bundles nomeados (fast/build/frontier) que
 * configuram tier de modelo + flow + retries. Inspirado nos profiles do Codex.
 */
import { describe, it, expect } from 'vitest'
import { resolveProfile, listProfiles, BUILT_IN_PROFILES } from '../core/config/profiles.js'

describe('resolveProfile — bundles nomeados (#F4)', () => {
  it("'fast' → cheap, flow off, retries 1", () => {
    expect(resolveProfile('fast')).toEqual({ modelTier: 'cheap', flow: false, retries: 1 })
  })

  it("'build' → build tier, flow on, retries 2", () => {
    expect(resolveProfile('build')).toEqual({ modelTier: 'build', flow: true, retries: 2 })
  })

  it("'frontier' → frontier tier, flow on, retries 3", () => {
    expect(resolveProfile('frontier')).toEqual({ modelTier: 'frontier', flow: true, retries: 3 })
  })

  it('nome desconhecido → undefined', () => {
    expect(resolveProfile('nope')).toBeUndefined()
  })

  it('listProfiles inclui fast, build e frontier', () => {
    const names = listProfiles()
    expect(names).toContain('fast')
    expect(names).toContain('build')
    expect(names).toContain('frontier')
  })

  it('BUILT_IN_PROFILES é a fonte das definições', () => {
    expect(Object.keys(BUILT_IN_PROFILES).sort()).toEqual(['build', 'fast', 'frontier'])
  })
})
