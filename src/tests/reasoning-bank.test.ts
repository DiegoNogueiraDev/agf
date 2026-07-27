import { describe, it, expect } from 'vitest'
import {
  createMemoryTrajectoryStore,
  storeTrajectory,
  toolSequenceSimilarity,
  OUTCOME_SCORE_MIN,
  OUTCOME_SCORE_MAX,
  TrajectorySchema,
} from '../core/learning/reasoning-bank.js'
import type { Trajectory } from '../core/learning/reasoning-bank.js'

function makeTrajectory(overrides: Partial<Trajectory> = {}): Trajectory {
  return {
    id: 't1',
    nodeId: 'n1',
    toolSequence: ['Read', 'Edit'],
    outcomeScore: 0.9,
    ts: 1000,
    ...overrides,
  }
}

describe('constants', () => {
  it('OUTCOME_SCORE_MIN is 0', () => {
    expect(OUTCOME_SCORE_MIN).toBe(0)
  })

  it('OUTCOME_SCORE_MAX is 1', () => {
    expect(OUTCOME_SCORE_MAX).toBe(1)
  })
})

describe('TrajectorySchema', () => {
  it('parses valid trajectory', () => {
    const result = TrajectorySchema.safeParse(makeTrajectory())
    expect(result.success).toBe(true)
  })

  it('rejects score above 1', () => {
    const result = TrajectorySchema.safeParse(makeTrajectory({ outcomeScore: 1.5 }))
    expect(result.success).toBe(false)
  })

  it('rejects score below 0', () => {
    const result = TrajectorySchema.safeParse(makeTrajectory({ outcomeScore: -0.1 }))
    expect(result.success).toBe(false)
  })

  it('rejects empty toolSequence', () => {
    const result = TrajectorySchema.safeParse(makeTrajectory({ toolSequence: [] }))
    expect(result.success).toBe(false)
  })
})

describe('createMemoryTrajectoryStore', () => {
  it('starts empty when no initial data', () => {
    const store = createMemoryTrajectoryStore()
    expect(store.count()).toBe(0)
    expect(store.all()).toEqual([])
  })

  it('starts with initial trajectories', () => {
    const t = makeTrajectory()
    const store = createMemoryTrajectoryStore([t])
    expect(store.count()).toBe(1)
  })

  it('insert increases count', () => {
    const store = createMemoryTrajectoryStore()
    store.insert(makeTrajectory())
    expect(store.count()).toBe(1)
  })

  it('all returns copy — mutations do not affect store', () => {
    const store = createMemoryTrajectoryStore()
    store.insert(makeTrajectory())
    const copy = store.all()
    copy.push(makeTrajectory({ id: 't2' }))
    expect(store.count()).toBe(1)
  })

  it('is immutable on insert — previous snapshots unchanged', () => {
    const store = createMemoryTrajectoryStore()
    const before = store.all()
    store.insert(makeTrajectory())
    expect(before.length).toBe(0)
  })
})

describe('storeTrajectory', () => {
  it('validates and stores valid payload', () => {
    const store = createMemoryTrajectoryStore()
    const result = storeTrajectory(store, makeTrajectory())
    expect(store.count()).toBe(1)
    expect(result.id).toBe('t1')
  })

  it('throws on invalid payload', () => {
    const store = createMemoryTrajectoryStore()
    expect(() => storeTrajectory(store, { id: '' })).toThrow()
  })

  it('does not store on invalid payload', () => {
    const store = createMemoryTrajectoryStore()
    try {
      storeTrajectory(store, { id: '', nodeId: '' })
    } catch (_err) {
      // expected — invalid payload should throw
    }
    expect(store.count()).toBe(0)
  })
})

describe('toolSequenceSimilarity', () => {
  it('returns 1 for identical sequences', () => {
    expect(toolSequenceSimilarity(['Read', 'Edit'], ['Read', 'Edit'])).toBe(1)
  })

  it('returns 0 for disjoint sequences', () => {
    expect(toolSequenceSimilarity(['Read'], ['Write'])).toBe(0)
  })

  it('returns 1 for two empty sequences', () => {
    expect(toolSequenceSimilarity([], [])).toBe(1)
  })

  it('returns partial similarity for overlapping sequences', () => {
    const sim = toolSequenceSimilarity(['Read', 'Edit'], ['Read', 'Write'])
    expect(sim).toBeGreaterThan(0)
    expect(sim).toBeLessThan(1)
  })

  it('is symmetric', () => {
    const a = ['Read', 'Edit', 'Bash']
    const b = ['Edit', 'Write']
    expect(toolSequenceSimilarity(a, b)).toBe(toolSequenceSimilarity(b, a))
  })
})
