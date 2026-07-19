/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { resolveLeverPlan, DEFAULT_PLAN } from '../core/economy/harness-lever-policy.js'

describe('resolveLeverPlan', () => {
  it('returns DEFAULT_PLAN conservador when called without valid rootDir', () => {
    const plan = resolveLeverPlan('/nonexistent/path')
    expect(plan).toEqual(DEFAULT_PLAN)
    expect(plan.lossyCodeAllowed).toBe(false)
    expect(plan.aggressiveness).toBeLessThan(0.5)
  })

  it('nunca lança exceção', () => {
    expect(() => resolveLeverPlan('/invalid/path/!!!!')).not.toThrow()
    expect(() => resolveLeverPlan()).not.toThrow()
  })

  it('DEFAULT_PLAN tem valores seguros', () => {
    expect(DEFAULT_PLAN.tier).toBe('cheap')
    expect(DEFAULT_PLAN.aggressiveness).toBe(0.3)
    expect(DEFAULT_PLAN.lossyCodeAllowed).toBe(false)
  })

  it('produz um LeverPlan válido', () => {
    const plan = resolveLeverPlan()
    expect(typeof plan.compress).toBe('boolean')
    expect(typeof plan.aggressiveness).toBe('number')
    expect(['standard', 'cheap', 'frontier']).toContain(plan.tier)
    expect(typeof plan.forceTscOnLowTypes).toBe('boolean')
  })
})
