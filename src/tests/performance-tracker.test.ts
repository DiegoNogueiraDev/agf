import { describe, it, expect } from 'vitest'
import {
  aggregatePerformance,
  recordsForAgent,
  trimToRecent,
  type PerfRecord,
} from '../core/learning/performance-tracker.js'

function makeRecord(overrides: Partial<PerfRecord> & { agentId: string }): PerfRecord {
  return {
    nodeId: 'n1',
    harnessDelta: 1,
    acPassed: true,
    cycleTimeMs: 1000,
    ts: 1000,
    ...overrides,
  }
}

describe('aggregatePerformance', () => {
  it('returns empty array for empty input', () => {
    expect(aggregatePerformance([])).toEqual([])
  })

  it('produces one AgentStats per agent', () => {
    const records = [makeRecord({ agentId: 'a1' }), makeRecord({ agentId: 'a2' })]
    const stats = aggregatePerformance(records)
    expect(stats).toHaveLength(2)
    const ids = stats.map((s) => s.agentId)
    expect(ids).toContain('a1')
    expect(ids).toContain('a2')
  })

  it('sets taskCount correctly', () => {
    const records = [makeRecord({ agentId: 'a1' }), makeRecord({ agentId: 'a1' }), makeRecord({ agentId: 'a1' })]
    const [stat] = aggregatePerformance(records)
    expect(stat.taskCount).toBe(3)
  })

  it('computes meanHarnessDelta', () => {
    const records = [makeRecord({ agentId: 'a1', harnessDelta: 2 }), makeRecord({ agentId: 'a1', harnessDelta: 4 })]
    const [stat] = aggregatePerformance(records)
    expect(stat.meanHarnessDelta).toBe(3)
  })

  it('computes acPassRate', () => {
    const records = [
      makeRecord({ agentId: 'a1', acPassed: true }),
      makeRecord({ agentId: 'a1', acPassed: false }),
      makeRecord({ agentId: 'a1', acPassed: true }),
    ]
    const [stat] = aggregatePerformance(records)
    expect(stat.acPassRate).toBeCloseTo(2 / 3)
  })

  it('sorts by meanHarnessDelta descending', () => {
    const records = [
      makeRecord({ agentId: 'slow', harnessDelta: 1 }),
      makeRecord({ agentId: 'fast', harnessDelta: 10 }),
    ]
    const [first, second] = aggregatePerformance(records)
    expect(first.agentId).toBe('fast')
    expect(second.agentId).toBe('slow')
  })

  it('tracks lastSeenTs as max ts', () => {
    const records = [
      makeRecord({ agentId: 'a1', ts: 100 }),
      makeRecord({ agentId: 'a1', ts: 500 }),
      makeRecord({ agentId: 'a1', ts: 300 }),
    ]
    const [stat] = aggregatePerformance(records)
    expect(stat.lastSeenTs).toBe(500)
  })

  it('computes p95CycleTimeMs', () => {
    const records = Array.from({ length: 100 }, (_, i) => makeRecord({ agentId: 'a1', cycleTimeMs: i + 1 }))
    const [stat] = aggregatePerformance(records)
    expect(stat.p95CycleTimeMs).toBeGreaterThan(0)
    expect(stat.p95CycleTimeMs).toBeLessThanOrEqual(100)
  })
})

describe('recordsForAgent', () => {
  it('returns empty array for unknown agent', () => {
    const records = [makeRecord({ agentId: 'a1' })]
    expect(recordsForAgent(records, 'unknown')).toEqual([])
  })

  it('filters to matching agent only', () => {
    const records = [
      makeRecord({ agentId: 'a1', nodeId: 'n1' }),
      makeRecord({ agentId: 'a2', nodeId: 'n2' }),
      makeRecord({ agentId: 'a1', nodeId: 'n3' }),
    ]
    const filtered = recordsForAgent(records, 'a1')
    expect(filtered).toHaveLength(2)
    expect(filtered.every((r) => r.agentId === 'a1')).toBe(true)
  })
})

describe('trimToRecent', () => {
  it('returns all records when count ≤ maxPerAgent', () => {
    const records = [makeRecord({ agentId: 'a1', ts: 1 }), makeRecord({ agentId: 'a1', ts: 2 })]
    expect(trimToRecent(records, 5)).toHaveLength(2)
  })

  it('keeps only the N most recent per agent', () => {
    const records = [
      makeRecord({ agentId: 'a1', ts: 1 }),
      makeRecord({ agentId: 'a1', ts: 3 }),
      makeRecord({ agentId: 'a1', ts: 2 }),
    ]
    const trimmed = trimToRecent(records, 2)
    const a1Records = trimmed.filter((r) => r.agentId === 'a1')
    expect(a1Records).toHaveLength(2)
    const tsList = a1Records.map((r) => r.ts)
    expect(tsList).toContain(3)
    expect(tsList).toContain(2)
  })

  it('trims each agent independently', () => {
    const records = [
      makeRecord({ agentId: 'a1', ts: 10 }),
      makeRecord({ agentId: 'a1', ts: 20 }),
      makeRecord({ agentId: 'a1', ts: 30 }),
      makeRecord({ agentId: 'a2', ts: 5 }),
    ]
    const trimmed = trimToRecent(records, 1)
    const a1Count = trimmed.filter((r) => r.agentId === 'a1').length
    const a2Count = trimmed.filter((r) => r.agentId === 'a2').length
    expect(a1Count).toBe(1)
    expect(a2Count).toBe(1)
  })
})
