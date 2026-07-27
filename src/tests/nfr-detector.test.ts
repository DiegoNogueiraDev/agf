import { describe, it, expect } from 'vitest'
import { detectNfrSignals, addressedNfrCategories, missingNfrCategories } from '../core/analyzer/nfr-detector.js'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'

function makeDoc(nodes: Partial<GraphNode>[]): GraphDocument {
  return {
    nodes: nodes.map((n, i) => ({
      id: `n-${i}`,
      title: 'Node',
      type: 'task',
      status: 'pending',
      priority: 2,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      ...n,
    })),
    edges: [],
  } as unknown as GraphDocument
}

describe('detectNfrSignals', () => {
  it('returns empty set when no NFR keywords present', () => {
    const doc = makeDoc([{ title: 'Implement user login form' }])
    expect(detectNfrSignals(doc).size).toBe(0)
  })

  it('detects performance signal from task title', () => {
    const doc = makeDoc([{ title: 'Optimize response time to under 200ms' }])
    const signals = detectNfrSignals(doc)
    expect(signals.has('performance')).toBe(true)
  })

  it('detects security signal from task title', () => {
    const doc = makeDoc([{ title: 'Add authentication and authorization' }])
    const signals = detectNfrSignals(doc)
    expect(signals.has('security')).toBe(true)
  })

  it('detects multiple NFR signals from multiple nodes', () => {
    const doc = makeDoc([
      { title: 'p95 latency must be under 200ms' },
      { title: 'All endpoints require authentication via OAuth' },
    ])
    const signals = detectNfrSignals(doc)
    expect(signals.has('performance')).toBe(true)
    expect(signals.has('security')).toBe(true)
  })
})

describe('addressedNfrCategories', () => {
  it('returns empty set when no NFR requirement nodes exist', () => {
    const doc = makeDoc([{ title: 'Implement feature', type: 'task' }])
    expect(addressedNfrCategories(doc).size).toBe(0)
  })
})

describe('missingNfrCategories', () => {
  it('returns empty array when no NFR signals detected', () => {
    const doc = makeDoc([{ title: 'Build login form' }])
    expect(missingNfrCategories(doc)).toHaveLength(0)
  })

  it('returns signalled categories not covered by NFR requirement nodes', () => {
    const doc = makeDoc([{ title: 'response time must be under 100ms', type: 'task' }])
    const missing = missingNfrCategories(doc)
    expect(missing).toContain('performance')
  })
})
