/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { identifyQuickWins, generateMicroPRPlan } from '../core/harness/self-healing-planner.js'

describe('identifyQuickWins', () => {
  it('returns empty array when all dimensions score >= 70', () => {
    const wins = identifyQuickWins([
      { name: 'type_coverage', score: 90, weight: 0.25 },
      { name: 'test_coverage', score: 85, weight: 0.25 },
    ])
    expect(wins).toEqual([])
  })

  it('returns quick wins sorted by potential impact descending', () => {
    const wins = identifyQuickWins([
      { name: 'type_coverage', score: 30, weight: 0.25 },
      { name: 'test_coverage', score: 20, weight: 0.25 },
    ])
    expect(wins).toHaveLength(2)
    expect(wins[0].potentialImpact).toBeGreaterThanOrEqual(wins[1].potentialImpact)
  })

  it('limits to MAX_QUICK_WINS (5) results', () => {
    const manyDims = Array.from({ length: 10 }, (_, i) => ({
      name: `dim_${i}`,
      score: 30,
      weight: 0.1,
    }))
    const wins = identifyQuickWins(manyDims)
    expect(wins.length).toBeLessThanOrEqual(5)
  })

  it('calculates potentialImpact as weight * gap', () => {
    const wins = identifyQuickWins([{ name: 'type_coverage', score: 50, weight: 0.25 }])
    expect(wins).toHaveLength(1)
    expect(wins[0].potentialImpact).toBe(5) // 0.25 * (70 - 50)
  })

  it('uses default action for unknown dimensions', () => {
    const wins = identifyQuickWins([{ name: 'unknown_dim', score: 30, weight: 0.1 }])
    expect(wins[0].suggestedAction).toBe('Improve unknown_dim')
  })

  it('uses known action for recognized dimensions', () => {
    const wins = identifyQuickWins([{ name: 'type_coverage', score: 30, weight: 0.25 }])
    expect(wins[0].suggestedAction).toContain('Replace `any` types')
  })
})

describe('generateMicroPRPlan', () => {
  it('generates a non-rejected plan for small gaps', () => {
    const win = {
      dimension: 'type_coverage',
      currentScore: 60,
      targetScore: 70,
      potentialImpact: 2.5,
      suggestedAction: 'Fix types',
    }
    const plan = generateMicroPRPlan(win, true)
    expect(plan.rejected).toBe(false)
    expect(plan.dryRun).toBe(true)
    expect(plan.dimension).toBe('type_coverage')
    expect(plan.estimatedDelta).toBeGreaterThan(0)
  })

  it('rejects plan when estimated lines exceed max', () => {
    const win = {
      dimension: 'test_coverage',
      currentScore: 0,
      targetScore: 70,
      potentialImpact: 17.5,
      suggestedAction: 'Add tests',
    }
    const plan = generateMicroPRPlan(win, true)
    expect(plan.rejected).toBe(true)
    expect(plan.rejectReason).toContain('exceeds maximum')
  })

  it('caps points to fix at 10 per micro-PR', () => {
    const win = {
      dimension: 'type_coverage',
      currentScore: 10,
      targetScore: 70,
      potentialImpact: 15,
      suggestedAction: 'Fix types',
    }
    const plan = generateMicroPRPlan(win, true)
    expect(plan.estimatedDelta).toBe(10)
  })

  it('passes dryRun flag through', () => {
    const win = {
      dimension: 'naming_clarity',
      currentScore: 50,
      targetScore: 70,
      potentialImpact: 2,
      suggestedAction: 'Rename',
    }
    const plan = generateMicroPRPlan(win, false)
    expect(plan.dryRun).toBe(false)
  })

  it('generates branch name from dimension', () => {
    const win = {
      dimension: 'error_handling',
      currentScore: 50,
      targetScore: 70,
      potentialImpact: 1,
      suggestedAction: 'Fix errors',
    }
    const plan = generateMicroPRPlan(win, true)
    expect(plan.branch).toBe('harness/improve-error_handling')
  })
})
