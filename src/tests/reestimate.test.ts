import { describe, it, expect } from 'vitest'
import { estimateDrifts, formatRange } from '../core/planner/reestimate.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: object[] = []): GraphDocument {
  return {
    version: 1,
    project: 'test',
    nodes: nodes as GraphDocument['nodes'],
    edges: [],
    indexes: { byId: {}, byType: {}, byStatus: {} },
    meta: {},
  } as unknown as GraphDocument
}

function makeTask(overrides: object = {}) {
  return {
    id: 't1',
    type: 'task',
    title: 'T',
    status: 'ready',
    xpSize: 'M',
    estimateMinutes: 45,
    ...overrides,
  }
}

describe('formatRange', () => {
  it('renders finite range as "min-maxmin"', () => {
    expect(formatRange([16, 30])).toBe('16-30min')
  })

  it('renders infinite upper bound as "> Nmin"', () => {
    expect(formatRange([121, Infinity])).toBe('> 120min')
  })
})

describe('estimateDrifts', () => {
  it('returns empty array when no tasks', () => {
    expect(estimateDrifts(makeDoc())).toHaveLength(0)
  })

  it('returns empty when all tasks are within range', () => {
    const doc = makeDoc([makeTask({ xpSize: 'M', estimateMinutes: 45 })])
    expect(estimateDrifts(doc)).toHaveLength(0)
  })

  it('detects drift when estimate is too low for size', () => {
    // XL task with 10 minutes (should be > 120)
    const doc = makeDoc([makeTask({ xpSize: 'XL', estimateMinutes: 10 })])
    const drifts = estimateDrifts(doc)
    expect(drifts).toHaveLength(1)
    expect(drifts[0].xpSize).toBe('XL')
  })

  it('detects drift when estimate is too high for size', () => {
    // XS task with 60 minutes (should be 0-15)
    const doc = makeDoc([makeTask({ xpSize: 'XS', estimateMinutes: 60 })])
    expect(estimateDrifts(doc)).toHaveLength(1)
  })

  it('skips done tasks', () => {
    const doc = makeDoc([makeTask({ xpSize: 'XS', estimateMinutes: 999, status: 'done' })])
    expect(estimateDrifts(doc)).toHaveLength(0)
  })

  it('skips tasks without xpSize or estimateMinutes', () => {
    const doc = makeDoc([
      makeTask({ xpSize: undefined, estimateMinutes: 999 }),
      makeTask({ xpSize: 'M', estimateMinutes: undefined }),
    ])
    expect(estimateDrifts(doc)).toHaveLength(0)
  })
})
