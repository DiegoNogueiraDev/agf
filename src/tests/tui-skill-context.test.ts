/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_77dfa3d45d95 — C67-T1: tests for createSkillContext factory
 *
 * AC: returns object with correct defaults (dir, testCmd, ledger, onProgress, signal)
 */

import { describe, it, expect, vi } from 'vitest'
import { createSkillContext, type SkillContextOptions } from '../tui/skill-context.js'
import { TokenLedger } from '../core/autonomy/token-ledger.js'

const fakeStore = {} as Parameters<typeof createSkillContext>[0]['store']

describe('createSkillContext', () => {
  it('returns an object with the provided store', () => {
    const ctx = createSkillContext({ store: fakeStore })
    expect(ctx.store).toBe(fakeStore)
  })

  it('defaults dir to process.cwd() when not provided', () => {
    const ctx = createSkillContext({ store: fakeStore })
    expect(ctx.dir).toBe(process.cwd())
  })

  it('uses provided dir when given', () => {
    const ctx = createSkillContext({ store: fakeStore, dir: '/custom/path' })
    expect(ctx.dir).toBe('/custom/path')
  })

  it('defaults testCmd to npm test when not provided', () => {
    const ctx = createSkillContext({ store: fakeStore })
    expect(ctx.testCmd).toBe('npm test')
  })

  it('uses provided testCmd when given', () => {
    const ctx = createSkillContext({ store: fakeStore, testCmd: 'vitest run' })
    expect(ctx.testCmd).toBe('vitest run')
  })

  it('creates a fresh TokenLedger instance', () => {
    const ctx = createSkillContext({ store: fakeStore })
    expect(ctx.ledger).toBeInstanceOf(TokenLedger)
  })

  it('creates a distinct ledger per call (not shared)', () => {
    const a = createSkillContext({ store: fakeStore })
    const b = createSkillContext({ store: fakeStore })
    expect(a.ledger).not.toBe(b.ledger)
  })

  it('onProgress is a noop function (does not throw)', () => {
    const ctx = createSkillContext({ store: fakeStore })
    expect(() => ctx.onProgress({ label: 'x', status: 'running' })).not.toThrow()
  })

  it('onProgress returns undefined', () => {
    const ctx = createSkillContext({ store: fakeStore })
    const result = ctx.onProgress({ label: 'x', status: 'done' })
    expect(result).toBeUndefined()
  })

  it('signal is undefined when not provided', () => {
    const ctx = createSkillContext({ store: fakeStore })
    expect(ctx.signal).toBeUndefined()
  })

  it('passes signal through when provided', () => {
    const signal = { aborted: false } as const
    const ctx = createSkillContext({ store: fakeStore, signal })
    expect(ctx.signal).toBe(signal)
  })

  it('signal reflects aborted:true when provided as such', () => {
    const signal = { aborted: true } as const
    const ctx = createSkillContext({ store: fakeStore, signal })
    expect(ctx.signal?.aborted).toBe(true)
  })
})
