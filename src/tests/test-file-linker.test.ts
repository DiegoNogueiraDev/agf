/*!
 * Task node_34dc9de7b572 — linker task→test via testFiles (edge verified_by).
 *
 * AC1: Given a task with testFiles filled and no existing test edge,
 *      When linked, Then proposes a verified_by edge.
 * AC2: Given re-execution, When linked again,
 *      Then proposes nothing (idempotent).
 */

import { describe, it, expect } from 'vitest'
import { inferTestFileEdges, type TestEdgeProposal } from '../core/gaps/test-file-linker.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'

const TS = new Date().toISOString()

function node(id: string, testFiles?: string[]): GraphNode {
  return {
    id,
    type: 'task',
    title: `Task ${id}`,
    status: 'in_progress',
    priority: 3,
    createdAt: TS,
    updatedAt: TS,
    testFiles,
  }
}

function edge(from: string, to: string, relationType: string): GraphEdge {
  return { from, to, relationType, createdAt: TS }
}

function makeDoc(nodes: GraphNode[], edges: GraphEdge[] = []) {
  return {
    version: '1.0.0',
    project: { id: 'proj_test', name: 'Test', createdAt: TS },
    nodes,
    edges,
    indexes: { byId: {} as Record<string, GraphNode> },
    meta: {},
  }
}

describe('inferTestFileEdges', () => {
  it('proposes verified_by edge when testFiles filled and no edge exists (AC1)', () => {
    const task = node('task_1', ['src/tests/my-feature.test.ts'])
    const doc = makeDoc([task])
    const proposals: TestEdgeProposal[] = inferTestFileEdges(doc, 'task_1')
    expect(proposals).toHaveLength(1)
    expect(proposals[0].from).toBe('task_1')
    expect(proposals[0].relationType).toBe('verified_by')
    expect(proposals[0].testFile).toBe('src/tests/my-feature.test.ts')
    expect(proposals[0].applyVia).toContain('task_1')
  })

  it('proposes nothing when task already has a verified_by edge (AC2 — idempotent)', () => {
    const task = node('task_2', ['src/tests/my-feature.test.ts'])
    const alreadyLinked = edge('task_2', 'test_node', 'tests')
    const doc = makeDoc([task], [alreadyLinked])
    const proposals = inferTestFileEdges(doc, 'task_2')
    expect(proposals).toHaveLength(0)
  })

  it('proposes nothing when testFiles is empty', () => {
    const task = node('task_3', [])
    const doc = makeDoc([task])
    expect(inferTestFileEdges(doc, 'task_3')).toHaveLength(0)
  })
})
