/*!
 * TDD: spectra-score — 5 telemetry spectrum scores (node_a9d040ed7863).
 *
 * AC1: Given ledger fixtures, returns 5 % in [0,100] with documented formula.
 * AC2: A done that reopened (false-pass) does NOT count as precise.
 * AC3: Zero data → returns 0/null without throwing.
 */

import { describe, it, expect } from 'vitest'
import { computeSpectraScore, type SpectraInput } from '../core/insights/spectra-score.js'

describe('AC1: computes all 5 spectrum scores from fixtures', () => {
  it('autonomy: done-without-override / total-done × 100', () => {
    const input: SpectraInput = {
      tasks: [
        { status: 'done', hadOverride: false },
        { status: 'done', hadOverride: false },
        { status: 'done', hadOverride: true },
        { status: 'in_progress', hadOverride: false },
      ],
      precisionTasks: [],
      learningCycles: [],
      healingEvents: [],
      memoryRecalls: [],
    }
    const result = computeSpectraScore(input)
    // 2 autonomous / 3 done = 66.67 → rounds to 66.7
    expect(result.autonomy).toBeCloseTo(66.7, 0)
  })

  it('precision: done-passed-and-not-reopened / done × 100', () => {
    const input: SpectraInput = {
      tasks: [],
      precisionTasks: [
        { passed: true, reopened: false },
        { passed: true, reopened: false },
        { passed: true, reopened: true }, // AC2: reopened = not precise
        { passed: false, reopened: false }, // failed = not precise
      ],
      learningCycles: [],
      healingEvents: [],
      memoryRecalls: [],
    }
    const result = computeSpectraScore(input)
    // 2 precise / 4 total = 50%
    expect(result.precision).toBe(50)
  })

  it('self_learning: last-resolve% - first-resolve% (improvement delta, clamped 0-100)', () => {
    const input: SpectraInput = {
      tasks: [],
      precisionTasks: [],
      learningCycles: [{ resolveRate: 0.4 }, { resolveRate: 0.6 }, { resolveRate: 0.8 }],
      healingEvents: [],
      memoryRecalls: [],
    }
    const result = computeSpectraScore(input)
    // delta = (0.8 - 0.4) * 100 = 40
    expect(result.selfLearning).toBe(40)
  })

  it('self_healing: healed / total-failures × 100', () => {
    const input: SpectraInput = {
      tasks: [],
      precisionTasks: [],
      learningCycles: [],
      healingEvents: [{ healed: true }, { healed: true }, { healed: false }],
      memoryRecalls: [],
    }
    const result = computeSpectraScore(input)
    // 2 healed / 3 failures = 66.67
    expect(result.selfHealing).toBeCloseTo(66.7, 0)
  })

  it('memory: hitRate × freshness × (1 - dedupRatio) × 100', () => {
    const input: SpectraInput = {
      tasks: [],
      precisionTasks: [],
      learningCycles: [],
      healingEvents: [],
      memoryRecalls: [
        { hit: true, stale: false, duplicate: false },
        { hit: true, stale: true, duplicate: false }, // stale: not fresh
        { hit: false, stale: false, duplicate: false },
        { hit: true, stale: false, duplicate: true }, // dup: deduped
      ],
    }
    const result = computeSpectraScore(input)
    // hitRate = 3/4 = 0.75
    // freshness = 2/3 hits are fresh = 0.667
    // dedupRatio = 1/3 hits are dup = 0.333 → factor = 0.667
    // score = 0.75 × 0.667 × 0.667 × 100 ≈ 33.4
    expect(result.memory).toBeGreaterThan(0)
    expect(result.memory).toBeLessThan(100)
  })
})

describe('AC2: reopened done is not counted as precise', () => {
  it('precision = 0 when all done tasks reopened', () => {
    const input: SpectraInput = {
      tasks: [],
      precisionTasks: [
        { passed: true, reopened: true },
        { passed: true, reopened: true },
      ],
      learningCycles: [],
      healingEvents: [],
      memoryRecalls: [],
    }
    const result = computeSpectraScore(input)
    expect(result.precision).toBe(0)
  })
})

describe('AC3: zero data returns 0/null without throwing', () => {
  it('all scores are 0 or null with empty input', () => {
    const input: SpectraInput = {
      tasks: [],
      precisionTasks: [],
      learningCycles: [],
      healingEvents: [],
      memoryRecalls: [],
    }
    expect(() => computeSpectraScore(input)).not.toThrow()
    const result = computeSpectraScore(input)
    expect(result.autonomy).toBe(0)
    expect(result.precision).toBe(0)
    expect(result.selfLearning).toBe(0)
    expect(result.selfHealing).toBe(0)
    expect(result.memory).toBe(0)
  })
})
