import { describe, it, expect } from 'vitest'
import { detectDuplicatePrd } from '../core/gaps/detect-duplicate-prd.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: Partial<GraphDocument['nodes'][0]>[]): GraphDocument {
  return {
    nodes: nodes.map((n, i) => ({
      id: n.id ?? `n${i}`,
      title: n.title ?? `Node ${i}`,
      type: n.type ?? 'epic',
      status: n.status ?? 'backlog',
      description: n.description ?? '',
      acceptanceCriteria: [],
      tags: [],
      priority: 3,
    })) as GraphDocument['nodes'],
    edges: [],
    projectId: 'test',
    projectName: 'test',
    version: '1',
  }
}

describe('detectDuplicatePrd', () => {
  it('returns no gaps when titles are distinct', () => {
    const doc = makeDoc([
      { id: 'a', title: 'PRD: user authentication system', type: 'epic' },
      { id: 'b', title: 'PRD: payment processing pipeline', type: 'epic' },
    ])
    expect(detectDuplicatePrd(doc)).toHaveLength(0)
  })

  it('reports a duplicate-risk gap for near-identical PRD titles', () => {
    const doc = makeDoc([
      { id: 'a', title: 'PRD: user authentication system v1', type: 'epic' },
      { id: 'b', title: 'PRD: user authentication system v2', type: 'epic' },
    ])
    const gaps = detectDuplicatePrd(doc)
    expect(gaps.length).toBeGreaterThan(0)
    expect(gaps[0]!.kind).toBe('duplicate_prd')
  })

  it('does not auto-delete — nodeCount unchanged (report only)', () => {
    const doc = makeDoc([
      { id: 'x', title: 'PRD: deploy pipeline alpha', type: 'epic' },
      { id: 'y', title: 'PRD: deploy pipeline beta', type: 'epic' },
    ])
    const before = doc.nodes.length
    detectDuplicatePrd(doc)
    expect(doc.nodes.length).toBe(before)
  })

  it('ignores non-epic nodes', () => {
    const doc = makeDoc([
      { id: 'a', title: 'near identical task title', type: 'task' },
      { id: 'b', title: 'near identical task title', type: 'task' },
    ])
    expect(detectDuplicatePrd(doc)).toHaveLength(0)
  })
})
