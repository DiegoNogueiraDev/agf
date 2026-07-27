import { describe, it, expect } from 'vitest'
import {
  scoreAgent,
  routeTask,
  explainRouting,
  MIN_SAMPLES_FOR_KNN,
  MANUAL_FALLBACK,
} from '../core/learning/sona-router.js'
import type { AgentStats, PerfRecord } from '../core/learning/performance-tracker.js'

function makeRecord(agentId: string, overrides?: Partial<PerfRecord>): PerfRecord {
  return {
    agentId,
    nodeId: 'n1',
    harnessDelta: 2,
    acPassed: true,
    cycleTimeMs: 1000,
    ts: 1000,
    ...overrides,
  }
}

function makeStats(agentId: string, overrides?: Partial<AgentStats>): AgentStats {
  return {
    agentId,
    taskCount: 10,
    meanHarnessDelta: 0.5,
    acPassRate: 0.8,
    meanCycleTimeMs: 1000,
    ...overrides,
  }
}

describe('constants', () => {
  it('MIN_SAMPLES_FOR_KNN is a positive integer', () => {
    expect(MIN_SAMPLES_FOR_KNN).toBeGreaterThan(0)
    expect(Number.isInteger(MIN_SAMPLES_FOR_KNN)).toBe(true)
  })

  it('MANUAL_FALLBACK is the string "manual"', () => {
    expect(MANUAL_FALLBACK).toBe('manual')
  })
})

describe('scoreAgent', () => {
  it('returns score and breakdown object', () => {
    const stats = makeStats('agent-a')
    const result = scoreAgent(stats)
    expect(result).toHaveProperty('score')
    expect(result).toHaveProperty('breakdown')
  })

  it('breakdown contains expected keys', () => {
    const stats = makeStats('agent-a')
    const { breakdown } = scoreAgent(stats)
    expect(breakdown).toHaveProperty('harnessDelta')
    expect(breakdown).toHaveProperty('acPassRate')
    expect(breakdown).toHaveProperty('cycleInverse')
  })

  it('score is higher for better-performing agent', () => {
    const goodStats = makeStats('good', { meanHarnessDelta: 5, acPassRate: 1.0, meanCycleTimeMs: 500 })
    const badStats = makeStats('bad', { meanHarnessDelta: -1, acPassRate: 0.2, meanCycleTimeMs: 5000 })
    expect(scoreAgent(goodStats).score).toBeGreaterThan(scoreAgent(badStats).score)
  })

  it('cycleInverse is 0 when meanCycleTimeMs is 0', () => {
    const stats = makeStats('a', { meanCycleTimeMs: 0 })
    const { breakdown } = scoreAgent(stats)
    expect(breakdown.cycleInverse).toBe(0)
  })
})

describe('routeTask', () => {
  it('returns manual fallback when no records', () => {
    const result = routeTask([])
    expect(result.agentId).toBe(MANUAL_FALLBACK)
    expect(result.fallback).toBe(true)
    expect(result.reason).toBe('cold-start')
  })

  it('returns manual fallback when fewer than MIN_SAMPLES_FOR_KNN records', () => {
    const records = Array.from({ length: MIN_SAMPLES_FOR_KNN - 1 }, (_, i) => makeRecord(`a${i}`))
    const result = routeTask(records)
    expect(result.fallback).toBe(true)
  })

  it('routes to best agent when enough records', () => {
    const records = [
      ...Array.from({ length: 3 }, () =>
        makeRecord('agent-good', { harnessDelta: 5, acPassed: true, cycleTimeMs: 300 }),
      ),
      ...Array.from({ length: 3 }, () =>
        makeRecord('agent-bad', { harnessDelta: -1, acPassed: false, cycleTimeMs: 9000 }),
      ),
    ]
    const result = routeTask(records)
    expect(result.agentId).toBe('agent-good')
    expect(result.fallback).toBe(false)
  })

  it('includes sampleCount in result', () => {
    const records = Array.from({ length: MIN_SAMPLES_FOR_KNN }, () => makeRecord('a'))
    const result = routeTask(records)
    expect(result.sampleCount).toBe(records.length)
  })
})

describe('explainRouting', () => {
  it('returns empty contributions for cold-start', () => {
    const result = explainRouting([])
    expect(result.contributions).toEqual([])
    expect(result.decision.fallback).toBe(true)
  })

  it('returns contributions for warm routing', () => {
    const records = [
      ...Array.from({ length: 3 }, () => makeRecord('agent-x', { harnessDelta: 2 })),
      ...Array.from({ length: 3 }, () => makeRecord('agent-y', { harnessDelta: 1 })),
    ]
    const result = explainRouting(records)
    expect(result.contributions.length).toBeGreaterThan(0)
    expect(result.contributions[0]).toHaveProperty('agentId')
    expect(result.contributions[0]).toHaveProperty('score')
    expect(result.contributions[0]).toHaveProperty('breakdown')
  })
})
