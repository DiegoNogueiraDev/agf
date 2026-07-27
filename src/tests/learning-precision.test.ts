/*!
 * Task node_6b727b01fde2 — Composite learning-precision score.
 *
 * AC1: accuracy=0.99, brier=0.05 → meetsTarget true
 * AC2: accuracy=0.98, brier=0.04 → meetsTarget false (accuracy below target)
 * AC3: returns full LearningPrecisionReport contract
 */

import { describe, it, expect } from 'vitest'
import { buildLearningPrecision, type LearningPrecisionReport } from '../core/learning/learning-precision.js'

describe('buildLearningPrecision', () => {
  it('meetsTarget true when accuracy=0.99 and brier=0.05 (AC1)', () => {
    const report = buildLearningPrecision({ accuracy: 0.99, regret: 0, brier: 0.05, ece: 0.02 })
    expect(report.meetsTarget).toBe(true)
  })

  it('meetsTarget false when accuracy=0.98 (below target) (AC2)', () => {
    const report = buildLearningPrecision({ accuracy: 0.98, regret: 1, brier: 0.04, ece: 0.03 })
    expect(report.meetsTarget).toBe(false)
  })

  it('returns full LearningPrecisionReport with all required fields (AC3)', () => {
    const report: LearningPrecisionReport = buildLearningPrecision({
      accuracy: 0.95,
      regret: 2,
      brier: 0.1,
      ece: 0.05,
    })
    expect(report).toHaveProperty('accuracy')
    expect(report).toHaveProperty('regret')
    expect(report).toHaveProperty('brier')
    expect(report).toHaveProperty('ece')
    expect(report).toHaveProperty('precisionScore')
    expect(report).toHaveProperty('meetsTarget')
    expect(typeof report.precisionScore).toBe('number')
  })

  it('precisionScore is in [0,1]', () => {
    const report = buildLearningPrecision({ accuracy: 0.8, regret: 5, brier: 0.3, ece: 0.1 })
    expect(report.precisionScore).toBeGreaterThanOrEqual(0)
    expect(report.precisionScore).toBeLessThanOrEqual(1)
  })

  it('perfect inputs give precisionScore of 1', () => {
    const report = buildLearningPrecision({ accuracy: 1.0, regret: 0, brier: 0, ece: 0 })
    expect(report.precisionScore).toBeCloseTo(1, 6)
    expect(report.meetsTarget).toBe(true)
  })
})
