/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_93d4343d9f4f AC coverage: colony-signals.ts
 *
 * AC: getColonySignals returns { caste, colony_health_grade, active_pheromones,
 *     quarantined_count, suggested_model } — zero LLM, fully deterministic
 */

import { describe, it, expect } from 'vitest'
import { getColonySignals, type ColonyStats } from '../core/colony/colony-signals.js'

function stats(overrides: Partial<ColonyStats> = {}): ColonyStats {
  return {
    byStatus: { backlog: 10, done: 5, in_progress: 1, blocked: 0, quarantined: 0 },
    ...overrides,
  }
}

// ── caste ────────────────────────────────────────────────────────────────────

describe('caste detection', () => {
  it('TRAIL when normal build mode (blocked ratio low)', () => {
    const s = stats({ byStatus: { backlog: 10, done: 5, in_progress: 1, blocked: 0, quarantined: 0 } })
    expect(getColonySignals(s).caste).toBe('TRAIL')
  })

  it('EXPLORE when blocked ratio > 0.2', () => {
    // 5 blocked out of 16 total = 31%
    const s = stats({ byStatus: { backlog: 5, done: 5, in_progress: 1, blocked: 5, quarantined: 0 } })
    expect(getColonySignals(s).caste).toBe('EXPLORE')
  })

  it('FUNGAL when no pending tasks exist (backlog = 0)', () => {
    const s = stats({ byStatus: { backlog: 0, done: 10, in_progress: 0, blocked: 0, quarantined: 0 } })
    expect(getColonySignals(s).caste).toBe('FUNGAL')
  })

  it('TRAIL when blocked ratio exactly 0.2 (boundary — not over)', () => {
    // 4 blocked out of 20 total = 20% — not > 0.2
    const s = stats({ byStatus: { backlog: 8, done: 5, in_progress: 3, blocked: 4, quarantined: 0 } })
    expect(getColonySignals(s).caste).toBe('TRAIL')
  })

  it('FUNGAL when backlog=0 and no blocked nodes (generation mode)', () => {
    const s = stats({ byStatus: { backlog: 0, done: 5, in_progress: 0, blocked: 0, quarantined: 0 } })
    expect(getColonySignals(s).caste).toBe('FUNGAL')
  })
})

// ── colony_health_grade ───────────────────────────────────────────────────────

describe('colony_health_grade', () => {
  it('A when harness score >= 90', () => {
    const result = getColonySignals(stats(), { harnessScore: 90 })
    expect(result.colony_health_grade).toBe('A')
  })

  it('B when harness score >= 75', () => {
    const result = getColonySignals(stats(), { harnessScore: 80 })
    expect(result.colony_health_grade).toBe('B')
  })

  it('C when harness score >= 60', () => {
    const result = getColonySignals(stats(), { harnessScore: 65 })
    expect(result.colony_health_grade).toBe('C')
  })

  it('D when harness score >= 40', () => {
    const result = getColonySignals(stats(), { harnessScore: 50 })
    expect(result.colony_health_grade).toBe('D')
  })

  it('F when harness score < 40', () => {
    const result = getColonySignals(stats(), { harnessScore: 30 })
    expect(result.colony_health_grade).toBe('F')
  })

  it('falls back to done-ratio grade when no harnessScore provided', () => {
    // done=8, total=10 → 80% → B
    const s = stats({ byStatus: { backlog: 2, done: 8, in_progress: 0, blocked: 0, quarantined: 0 } })
    const result = getColonySignals(s)
    expect(['A', 'B']).toContain(result.colony_health_grade)
  })
})

// ── quarantined_count ────────────────────────────────────────────────────────

describe('quarantined_count', () => {
  it('returns quarantined node count from stats', () => {
    const s = stats({ byStatus: { backlog: 5, done: 5, in_progress: 0, blocked: 0, quarantined: 3 } })
    expect(getColonySignals(s).quarantined_count).toBe(3)
  })

  it('returns 0 when no quarantined nodes', () => {
    expect(getColonySignals(stats()).quarantined_count).toBe(0)
  })
})

// ── active_pheromones ────────────────────────────────────────────────────────

describe('active_pheromones', () => {
  it('returns 0 by default', () => {
    expect(getColonySignals(stats()).active_pheromones).toBe(0)
  })

  it('returns provided activePheromones count', () => {
    expect(getColonySignals(stats(), { activePheromones: 7 }).active_pheromones).toBe(7)
  })
})

// ── suggested_model ───────────────────────────────────────────────────────────

describe('suggested_model', () => {
  it('TRAIL caste → cheap tier', () => {
    const s = stats({ byStatus: { backlog: 5, done: 5, in_progress: 1, blocked: 0, quarantined: 0 } })
    expect(getColonySignals(s).suggested_model).toBe('cheap')
  })

  it('EXPLORE caste → frontier tier', () => {
    const s = stats({ byStatus: { backlog: 0, done: 5, in_progress: 0, blocked: 5, quarantined: 0 } })
    expect(getColonySignals(s).suggested_model).toBe('frontier')
  })

  it('FUNGAL caste → build tier', () => {
    const s = stats({ byStatus: { backlog: 0, done: 10, in_progress: 0, blocked: 0, quarantined: 0 } })
    expect(getColonySignals(s).suggested_model).toBe('build')
  })
})

// ── return shape ──────────────────────────────────────────────────────────────

describe('return shape', () => {
  it('has all required fields', () => {
    const result = getColonySignals(stats())
    expect(typeof result.caste).toBe('string')
    expect(typeof result.colony_health_grade).toBe('string')
    expect(typeof result.active_pheromones).toBe('number')
    expect(typeof result.quarantined_count).toBe('number')
    expect(typeof result.suggested_model).toBe('string')
  })
})
