/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_6884cd794e3c — E5.1: colony-health status function
 *
 * AC: score=0-100, grade=A-F, trend=up|stable|down|critical,
 *     breakdown={harness,tests,dora,knowledge,pheromone,quarantined}
 *     formula: harness*0.30 + tests*0.25 + dora*0.20 + knowledge*0.15 + pheromone*0.10
 */

import { describe, it, expect } from 'vitest'
import {
  buildColonyHealthStatus,
  gradeFromScore,
  type ColonyHealthStatusInput,
} from '../core/colony/colony-health-status.js'

function makeInput(overrides: Partial<ColonyHealthStatusInput> = {}): ColonyHealthStatusInput {
  return {
    harnessScore: 80,
    testPassRate: 75,
    doraScore: 60,
    knowledgeScore: 50,
    pheromoneScore: 40,
    quarantinedCount: 0,
    trend: 'stable',
    ...overrides,
  }
}

// ── gradeFromScore ─────────────────────────────────────────────────────────────

describe('gradeFromScore', () => {
  it('returns A for score >= 90', () => {
    expect(gradeFromScore(90)).toBe('A')
    expect(gradeFromScore(100)).toBe('A')
  })

  it('returns B for 75 <= score < 90', () => {
    expect(gradeFromScore(75)).toBe('B')
    expect(gradeFromScore(89)).toBe('B')
  })

  it('returns C for 60 <= score < 75', () => {
    expect(gradeFromScore(60)).toBe('C')
    expect(gradeFromScore(74)).toBe('C')
  })

  it('returns D for 40 <= score < 60', () => {
    expect(gradeFromScore(40)).toBe('D')
    expect(gradeFromScore(59)).toBe('D')
  })

  it('returns F for score < 40', () => {
    expect(gradeFromScore(0)).toBe('F')
    expect(gradeFromScore(39)).toBe('F')
  })
})

// ── buildColonyHealthStatus ────────────────────────────────────────────────────

describe('buildColonyHealthStatus', () => {
  it('computes weighted score with formula harness*0.30+tests*0.25+dora*0.20+knowledge*0.15+pheromone*0.10', () => {
    const input = makeInput({
      harnessScore: 80,
      testPassRate: 80,
      doraScore: 80,
      knowledgeScore: 80,
      pheromoneScore: 80,
    })
    const result = buildColonyHealthStatus(input)
    expect(result.score).toBeCloseTo(80, 1)
  })

  it('returns correct grade for computed score', () => {
    const result = buildColonyHealthStatus(
      makeInput({ harnessScore: 95, testPassRate: 95, doraScore: 95, knowledgeScore: 95, pheromoneScore: 95 }),
    )
    expect(result.grade).toBe('A')
  })

  it('returns grade F when all scores are low', () => {
    const result = buildColonyHealthStatus(
      makeInput({ harnessScore: 10, testPassRate: 10, doraScore: 10, knowledgeScore: 10, pheromoneScore: 10 }),
    )
    expect(result.grade).toBe('F')
  })

  it('includes breakdown with all required fields', () => {
    const result = buildColonyHealthStatus(makeInput())
    expect(result.breakdown).toHaveProperty('harness')
    expect(result.breakdown).toHaveProperty('tests')
    expect(result.breakdown).toHaveProperty('dora')
    expect(result.breakdown).toHaveProperty('knowledge')
    expect(result.breakdown).toHaveProperty('pheromone')
    expect(result.breakdown).toHaveProperty('quarantined')
  })

  it('passes through quarantinedCount to breakdown.quarantined', () => {
    const result = buildColonyHealthStatus(makeInput({ quarantinedCount: 5 }))
    expect(result.breakdown.quarantined).toBe(5)
  })

  it('passes through trend field', () => {
    const result = buildColonyHealthStatus(makeInput({ trend: 'up' }))
    expect(result.trend).toBe('up')
  })

  it('returns critical trend when passed', () => {
    const result = buildColonyHealthStatus(makeInput({ trend: 'critical' }))
    expect(result.trend).toBe('critical')
  })

  it('score is clamped to 0-100', () => {
    const result = buildColonyHealthStatus(
      makeInput({ harnessScore: 0, testPassRate: 0, doraScore: 0, knowledgeScore: 0, pheromoneScore: 0 }),
    )
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('breakdown reflects input values', () => {
    const result = buildColonyHealthStatus(makeInput({ harnessScore: 70, testPassRate: 55 }))
    expect(result.breakdown.harness).toBe(70)
    expect(result.breakdown.tests).toBe(55)
  })
})
