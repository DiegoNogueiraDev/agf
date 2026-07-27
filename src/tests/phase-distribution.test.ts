import { describe, it, expect } from 'vitest'
import { calculatePhaseDistribution } from '../core/insights/phase-distribution.js'
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
    id: Math.random().toString(36).slice(2),
    type: 'task',
    title: 'Task',
    status: 'ready',
    xpSize: 'M',
    tags: [],
    ...overrides,
  }
}

describe('calculatePhaseDistribution', () => {
  it('returns empty array for empty document', () => {
    const result = calculatePhaseDistribution(makeDoc())
    expect(Array.isArray(result)).toBe(true)
  })

  it('classifies tasks with implement tag into IMPLEMENT phase', () => {
    const doc = makeDoc([makeTask({ tags: ['implement'] })])
    const result = calculatePhaseDistribution(doc)
    const impl = result.find((p) => p.phase === 'IMPLEMENT')
    expect(impl?.taskCount).toBeGreaterThanOrEqual(1)
  })

  it('classifies tasks with design tag into DESIGN phase', () => {
    const doc = makeDoc([makeTask({ tags: ['design'] })])
    const result = calculatePhaseDistribution(doc)
    const design = result.find((p) => p.phase === 'DESIGN')
    expect(design?.taskCount).toBeGreaterThanOrEqual(1)
  })

  it('distributes percentages that sum to 100', () => {
    const doc = makeDoc([
      makeTask({ tags: ['implement'] }),
      makeTask({ tags: ['design'] }),
      makeTask({ tags: ['validate'] }),
    ])
    const result = calculatePhaseDistribution(doc)
    const total = result.reduce((sum, p) => sum + p.percentage, 0)
    expect(total).toBeGreaterThanOrEqual(98)
    expect(total).toBeLessThanOrEqual(102)
  })

  it('each distribution entry includes a color', () => {
    const doc = makeDoc([makeTask({ tags: ['implement'] })])
    const result = calculatePhaseDistribution(doc)
    for (const entry of result) {
      if (entry.taskCount > 0) {
        expect(typeof entry.color).toBe('string')
        expect(entry.color.length).toBeGreaterThan(0)
      }
    }
  })
})
