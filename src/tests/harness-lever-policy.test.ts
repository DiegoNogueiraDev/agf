/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { harnessLeverPolicy } from '../core/economy/harness-lever-policy.js'
import type { HarnessScanResult } from '../core/harness/harness-scan-runner.js'

function makeScan(
  overrides: Partial<HarnessScanResult> & { score: number; grade: 'A' | 'B' | 'C' | 'D' },
): HarnessScanResult {
  return {
    details: [],
    timestamp: new Date().toISOString(),
    ruleSuggestions: [],
    breakdown: {
      types: { score: 90, weight: 0.25 },
      tests: { score: 80, weight: 0.25 },
      fitness: { score: 70, weight: 0.15 },
      docs: { score: 70, weight: 0.1 },
      naming: { score: 90, weight: 0.1 },
      errors: { score: 70, weight: 0.05 },
      context: { score: 80, weight: 0.05 },
      provenance: { score: 50, weight: 0.05 },
    },
    ...overrides,
  }
}

describe('harnessLeverPolicy', () => {
  it('grade A + high tests → aggressiveness >= 0.7 and lossy-code allowed', () => {
    const plan = harnessLeverPolicy(
      makeScan({
        score: 90,
        grade: 'A',
        breakdown: {
          types: { score: 90, weight: 0.25 },
          tests: { score: 90, weight: 0.25 },
          fitness: { score: 80, weight: 0.15 },
          docs: { score: 80, weight: 0.1 },
          naming: { score: 95, weight: 0.1 },
          errors: { score: 90, weight: 0.05 },
          context: { score: 85, weight: 0.05 },
          provenance: { score: 70, weight: 0.05 },
        },
      }),
    )
    expect(plan.aggressiveness).toBeGreaterThanOrEqual(0.7)
    expect(plan.lossyCodeAllowed).toBe(true)
    expect(plan.tier).toBe('standard')
  })

  it('grade B + high tests → aggressiveness >= 0.7 and lossy-code allowed', () => {
    const plan = harnessLeverPolicy(
      makeScan({
        score: 85,
        grade: 'B',
        breakdown: {
          types: { score: 100, weight: 0.25 },
          tests: { score: 85, weight: 0.25 },
          fitness: { score: 65, weight: 0.15 },
          docs: { score: 70, weight: 0.1 },
          naming: { score: 90, weight: 0.1 },
          errors: { score: 30, weight: 0.05 },
          context: { score: 75, weight: 0.05 },
          provenance: { score: 20, weight: 0.05 },
        },
      }),
    )
    expect(plan.aggressiveness).toBeGreaterThanOrEqual(0.7)
    expect(plan.lossyCodeAllowed).toBe(true)
  })

  it('grade D → lossy-code prohibited and tier=frontier', () => {
    const plan = harnessLeverPolicy(makeScan({ score: 40, grade: 'D' }))
    expect(plan.lossyCodeAllowed).toBe(false)
    expect(plan.tier).toBe('frontier')
  })

  it('grade C → lossy-code prohibited but tier is standard', () => {
    const plan = harnessLeverPolicy(makeScan({ score: 60, grade: 'C' }))
    expect(plan.lossyCodeAllowed).toBe(false)
    expect(plan.tier).toBe('cheap')
  })

  it('grade A + low tests (< 70) → lossy-code prohibited (AC requires both conditions)', () => {
    const plan = harnessLeverPolicy(
      makeScan({
        score: 88,
        grade: 'A',
        breakdown: {
          types: { score: 95, weight: 0.25 },
          tests: { score: 40, weight: 0.25 },
          fitness: { score: 80, weight: 0.15 },
          docs: { score: 80, weight: 0.1 },
          naming: { score: 95, weight: 0.1 },
          errors: { score: 95, weight: 0.05 },
          context: { score: 90, weight: 0.05 },
          provenance: { score: 90, weight: 0.05 },
        },
      }),
    )
    expect(plan.lossyCodeAllowed).toBe(false)
    expect(plan.aggressiveness).toBeLessThan(0.5)
  })

  it('types.score < 80 → forceTscOnLowTypes = true', () => {
    const plan = harnessLeverPolicy(
      makeScan({
        score: 90,
        grade: 'A',
        breakdown: {
          types: { score: 60, weight: 0.25 },
          tests: { score: 90, weight: 0.25 },
          fitness: { score: 80, weight: 0.15 },
          docs: { score: 80, weight: 0.1 },
          naming: { score: 95, weight: 0.1 },
          errors: { score: 90, weight: 0.05 },
          context: { score: 85, weight: 0.05 },
          provenance: { score: 70, weight: 0.05 },
        },
      }),
    )
    expect(plan.forceTscOnLowTypes).toBe(true)
  })

  it('types.score >= 80 → forceTscOnLowTypes = false', () => {
    const plan = harnessLeverPolicy(makeScan({ score: 90, grade: 'A' }))
    expect(plan.forceTscOnLowTypes).toBe(false)
  })

  it('determinística: mesmo input → mesmo plano', () => {
    const scan = makeScan({ score: 85, grade: 'B' })
    const plan1 = harnessLeverPolicy(scan)
    const plan2 = harnessLeverPolicy(scan)
    expect(plan1).toEqual(plan2)
  })

  it('low grade C returns safe defaults', () => {
    const plan = harnessLeverPolicy(makeScan({ score: 55, grade: 'C' }))
    expect(plan.lossyCodeAllowed).toBe(false)
    expect(plan.forceTscOnLowTypes).toBe(false)
    expect(plan.aggressiveness).toBeLessThan(0.7)
    expect(plan.tier).toBe('cheap')
  })

  it('includes lever flags in plan', () => {
    const plan = harnessLeverPolicy(
      makeScan({
        score: 90,
        grade: 'A',
        breakdown: {
          types: { score: 95, weight: 0.25 },
          tests: { score: 90, weight: 0.25 },
          fitness: { score: 85, weight: 0.15 },
          docs: { score: 80, weight: 0.1 },
          naming: { score: 95, weight: 0.1 },
          errors: { score: 85, weight: 0.05 },
          context: { score: 85, weight: 0.05 },
          provenance: { score: 70, weight: 0.05 },
        },
      }),
    )
    expect(plan.compress).toBe(true)
    expect(typeof plan.cavemanInput).toBe('boolean')
    expect(typeof plan.contentDispatch).toBe('boolean')
    expect(typeof plan.skeletonize).toBe('boolean')
  })
})
