/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Tests for LLM tier router.
 */

import { describe, it, expect } from 'vitest'
import { dispatchTier, pickTier1Model, HAIKU, SONNET, OPUS } from '../core/llm/tier-router.js'

describe('pickTier1Model', () => {
  it('returns SONNET for budgets >= 8000', () => {
    expect(pickTier1Model(8000)).toBe(SONNET)
    expect(pickTier1Model(10000)).toBe(SONNET)
  })

  it('returns HAIKU for budgets < 8000', () => {
    expect(pickTier1Model(0)).toBe(HAIKU)
    expect(pickTier1Model(7999)).toBe(HAIKU)
  })

  it('returns HAIKU for undefined budget', () => {
    expect(pickTier1Model(undefined)).toBe(HAIKU)
  })
})

describe('dispatchTier', () => {
  describe('tier0 with booster', () => {
    it('returns booster output on hit', () => {
      const r = dispatchTier({
        tier: 'tier0',
        booster: () => ({ hit: true, output: 'booster-result', reason: 'regex-hit' }),
      })
      expect(r.tier).toBe('tier0')
      expect(r.model).toBeNull()
      expect(r.boosterOutput).toBe('booster-result')
      expect(r.reason).toBe('regex-hit')
    })

    it('escalates to tier1 on booster miss', () => {
      const r = dispatchTier({
        tier: 'tier0',
        tokenBudget: 1000,
        booster: () => ({ hit: false, reason: 'no-match' }),
      })
      expect(r.tier).toBe('tier1')
      expect(r.model).toBe(HAIKU)
      expect(r.reason).toBe('no-match → tier1')
    })

    it('escalates to tier1 with SONNET when budget is high', () => {
      const r = dispatchTier({
        tier: 'tier0',
        tokenBudget: 10000,
        booster: () => ({ hit: false }),
      })
      expect(r.tier).toBe('tier1')
      expect(r.model).toBe(SONNET)
    })
  })

  describe('tier0 without booster', () => {
    it('returns tier0 with no model', () => {
      const r = dispatchTier({ tier: 'tier0' })
      expect(r.tier).toBe('tier0')
      expect(r.model).toBeNull()
      expect(r.reason).toBe('tier0-no-booster')
    })
  })

  describe('tier1', () => {
    it('returns HAIKU for small budgets', () => {
      const r = dispatchTier({ tier: 'tier1', tokenBudget: 1000 })
      expect(r.tier).toBe('tier1')
      expect(r.model).toBe(HAIKU)
    })

    it('returns SONNET for large budgets', () => {
      const r = dispatchTier({ tier: 'tier1', tokenBudget: 10000 })
      expect(r.tier).toBe('tier1')
      expect(r.model).toBe(SONNET)
    })
  })

  describe('tier2', () => {
    it('always returns OPUS', () => {
      const r = dispatchTier({ tier: 'tier2' })
      expect(r.tier).toBe('tier2')
      expect(r.model).toBe(OPUS)
      expect(r.reason).toBe('tier2')
    })
  })
})
