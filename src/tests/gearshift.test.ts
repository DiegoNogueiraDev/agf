/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  resolveAutoGear,
  gearForComplexity,
  shouldEscalateFromCheapFailures,
  escalateGear,
  deescalateGear,
  effortForGear,
  type AutoGearResult,
} from '../core/model-hub/gearshift.js'
import type { TaskFeatures } from '../core/model-hub/tier-router.js'

describe('resolveAutoGear', () => {
  it('gear=1 (cheap tier), effort=low for a trivial task (acCount=1, deps=0, size=S)', () => {
    const features: TaskFeatures = { acCount: 1, dependencyCount: 0, blockerCount: 0, xpSize: 'S' }
    const result = resolveAutoGear(features, true)
    expect(result.gear).toBe(1)
    expect(result.tier).toBe('cheap')
    expect(result.effort).toBe('low')
  })

  it('gear=4 (frontier tier), effort=high for a complex security task (acCount=5, deps=4, security tag)', () => {
    const features: TaskFeatures = { acCount: 5, dependencyCount: 4, blockerCount: 0, tags: ['security'] }
    const result = resolveAutoGear(features, true)
    expect(result.gear).toBe(4)
    expect(result.tier).toBe('frontier')
    expect(result.effort).toBe('high')
  })

  it('gear=2 (build tier), effort=low for a medium task (acCount=2, deps=2)', () => {
    const features: TaskFeatures = { acCount: 2, dependencyCount: 2, blockerCount: 0 }
    const result = resolveAutoGear(features, true)
    expect(result.gear).toBe(2)
    expect(result.tier).toBe('build')
    expect(result.effort).toBe('low')
  })

  it('returns {gear, tier, model, effort, rationale} with no LLM call (pure, synchronous)', () => {
    const features: TaskFeatures = { acCount: 2, dependencyCount: 2, blockerCount: 0 }
    const result: AutoGearResult = resolveAutoGear(features, true)
    expect(result).toHaveProperty('gear')
    expect(result).toHaveProperty('tier')
    expect(result).toHaveProperty('model')
    expect(result).toHaveProperty('effort')
    expect(result).toHaveProperty('rationale')
    expect(typeof result.rationale).toBe('string')
    expect(result.rationale.length).toBeGreaterThan(0)
  })

  it('gear=3 (build tier, high sub-range), effort stays low — the upper-build escalation seam', () => {
    // score = 4*2(ac) + 3*3(dep) + 10(L) = 8+9+10 = 27 -> would be frontier; use a
    // score that lands in the UPPER half of the build range (18..25) instead.
    const features: TaskFeatures = { acCount: 3, dependencyCount: 2, blockerCount: 0, xpSize: 'M' }
    // score = 3*2 + 2*3 + 5(M) = 6+6+5 = 17 -> still low-build; bump with a bug tag.
    const bumped: TaskFeatures = { ...features, tags: ['bug'] } // +3 -> 20, upper-build
    const result = resolveAutoGear(bumped, true)
    expect(result.gear).toBe(3)
    expect(result.tier).toBe('build')
  })

  it('autoMode=false skips feature-based computation and returns the safe default gear', () => {
    const features: TaskFeatures = { acCount: 5, dependencyCount: 4, blockerCount: 0, tags: ['security'] }
    const result = resolveAutoGear(features, false)
    expect(result.gear).toBe(2)
    expect(result.tier).toBe('build')
    expect(result.rationale).toMatch(/auto.*(off|disabled|desligad)/i)
  })
})

describe('gearForComplexity', () => {
  it('maps score<10 to gear 1 (cheap)', () => {
    expect(gearForComplexity(2)).toBe(1)
  })
  it('maps 10<=score<=17 to gear 2 (build, low sub-range)', () => {
    expect(gearForComplexity(10)).toBe(2)
    expect(gearForComplexity(17)).toBe(2)
  })
  it('maps 18<=score<=25 to gear 3 (build, high sub-range)', () => {
    expect(gearForComplexity(18)).toBe(3)
    expect(gearForComplexity(25)).toBe(3)
  })
  it('maps score>25 to gear 4 (frontier)', () => {
    expect(gearForComplexity(26)).toBe(4)
  })
})

describe('escalateGear', () => {
  it('bumps gear by one, capping at 4', () => {
    expect(escalateGear(1)).toBe(2)
    expect(escalateGear(2)).toBe(3)
    expect(escalateGear(3)).toBe(4)
    expect(escalateGear(4)).toBe(4)
  })
})

describe('deescalateGear', () => {
  it('drops gear by one, floored at 1', () => {
    expect(deescalateGear(4)).toBe(3)
    expect(deescalateGear(3)).toBe(2)
    expect(deescalateGear(2)).toBe(1)
    expect(deescalateGear(1)).toBe(1)
  })
})

describe('effortForGear', () => {
  it('maps each gear to a ReasoningEffort level, monotonically low to high', () => {
    expect(effortForGear(1)).toBe('low')
    expect(effortForGear(2)).toBe('medium')
    expect(effortForGear(3)).toBe('high')
    expect(effortForGear(4)).toBe('high')
  })
})

describe('shouldEscalateFromCheapFailures', () => {
  it('escalates when the cheap arm has enough pulls and a low success rate (history of failure)', () => {
    expect(shouldEscalateFromCheapFailures({ pulls: 4, successes: 1 })).toBe(true)
  })

  it('does not escalate with too few pulls to be meaningful evidence', () => {
    expect(shouldEscalateFromCheapFailures({ pulls: 1, successes: 0 })).toBe(false)
  })

  it('does not escalate when the cheap arm has a healthy success rate', () => {
    expect(shouldEscalateFromCheapFailures({ pulls: 10, successes: 9 })).toBe(false)
  })

  it('does not escalate when there is no evidence at all (undefined arm)', () => {
    expect(shouldEscalateFromCheapFailures(undefined)).toBe(false)
  })
})
