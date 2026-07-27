import { describe, it, expect } from 'vitest'
import { analyzeTrajectory } from '../core/skills/trajectory-analyzer.js'

describe('analyzeTrajectory', () => {
  it('returns shouldPropose=false when no reasons trigger', () => {
    const result = analyzeTrajectory({
      cycleTimeMs: 60_000,
      estimateMinutes: 60,
      adrCreated: false,
      summary: 'Normal implementation task completed.',
    })
    expect(result.shouldPropose).toBe(false)
    expect(result.reasons).toEqual([])
  })

  it('adds "retries" reason when actual time exceeds 2x estimate', () => {
    const result = analyzeTrajectory({
      cycleTimeMs: 150_000,
      estimateMinutes: 1,
      adrCreated: false,
      summary: 'Task done.',
    })
    expect(result.reasons).toContain('retries')
    expect(result.shouldPropose).toBe(true)
  })

  it('does not add "retries" when actual is within 2x estimate', () => {
    const result = analyzeTrajectory({
      cycleTimeMs: 60_000,
      estimateMinutes: 2,
      adrCreated: false,
      summary: 'Task done.',
    })
    expect(result.reasons).not.toContain('retries')
  })

  it('adds "adr" reason when adrCreated is true', () => {
    const result = analyzeTrajectory({
      cycleTimeMs: 30_000,
      estimateMinutes: 60,
      adrCreated: true,
      summary: 'Decided on architecture.',
    })
    expect(result.reasons).toContain('adr')
    expect(result.shouldPropose).toBe(true)
  })

  it('adds "discovered" reason when summary contains "discovered"', () => {
    const result = analyzeTrajectory({
      cycleTimeMs: 30_000,
      estimateMinutes: 60,
      adrCreated: false,
      summary: 'We discovered a hidden edge case.',
    })
    expect(result.reasons).toContain('discovered')
    expect(result.shouldPropose).toBe(true)
  })

  it('matches the Portuguese "não-óbvio" term', () => {
    const result = analyzeTrajectory({
      cycleTimeMs: 30_000,
      estimateMinutes: 60,
      adrCreated: false,
      summary: 'Encontrado problema não-óbvio no pipeline.',
    })
    expect(result.reasons).toContain('discovered')
  })

  it('accumulates multiple reasons', () => {
    const result = analyzeTrajectory({
      cycleTimeMs: 180_000,
      estimateMinutes: 1,
      adrCreated: true,
      summary: 'discovered an unexpected issue.',
    })
    expect(result.reasons.length).toBeGreaterThanOrEqual(3)
    expect(result.shouldPropose).toBe(true)
  })

  it('ignores estimateMinutes=0 for retries check', () => {
    const result = analyzeTrajectory({
      cycleTimeMs: 999_999,
      estimateMinutes: 0,
      adrCreated: false,
      summary: 'No estimate set.',
    })
    expect(result.reasons).not.toContain('retries')
  })
})
