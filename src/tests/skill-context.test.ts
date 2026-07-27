/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_1adf757784bf — C86-T1: tests for createSkillContext (correct basename for harness)
 *
 * AC: harness violation for skill-context resolved; blast gate passes
 */

import { describe, it, expect } from 'vitest'
import { createSkillContext } from '../tui/skill-context.js'
import { TokenLedger } from '../core/autonomy/token-ledger.js'

const fakeStore = {} as Parameters<typeof createSkillContext>[0]['store']

describe('createSkillContext (skill-context)', () => {
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

  it('creates a fresh TokenLedger instance', () => {
    const ctx = createSkillContext({ store: fakeStore })
    expect(ctx.ledger).toBeInstanceOf(TokenLedger)
  })

  it('creates a distinct ledger per call', () => {
    const a = createSkillContext({ store: fakeStore })
    const b = createSkillContext({ store: fakeStore })
    expect(a.ledger).not.toBe(b.ledger)
  })

  it('onProgress does not throw', () => {
    const ctx = createSkillContext({ store: fakeStore })
    expect(() => ctx.onProgress({ label: 'x', status: 'running' })).not.toThrow()
  })

  it('signal is undefined when not provided', () => {
    const ctx = createSkillContext({ store: fakeStore })
    expect(ctx.signal).toBeUndefined()
  })
})
