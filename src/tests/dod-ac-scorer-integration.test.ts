/*!
 * Task node_6f801de5f907 — plug ac scorer into agf check DoD.
 *
 * AC1: Given a node whose ACs all score < 60, When DoD computed,
 *      Then has_testable_ac check fails citing the scorer reason.
 * AC2: Given a node with at least 1 AC scoring ≥ 60, When DoD computed,
 *      Then has_testable_ac check passes.
 */

import { describe, it, expect } from 'vitest'
import { checkDefinitionOfDone } from '../core/implementer/definition-of-done.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'

const TS = new Date().toISOString()

function makeNode(id: string, type: string, title: string, extra: Partial<GraphNode> = {}): GraphNode {
  return { id, type, title, status: 'in_progress', priority: 3, createdAt: TS, updatedAt: TS, ...extra }
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

describe('DoD has_testable_ac uses score ≥ 60 threshold', () => {
  it('fails when all ACs score < 60 and cites reason (AC1)', () => {
    const task = makeNode('task_1', 'task', 'Weak AC node', { acceptanceCriteria: ['it works somehow'] })
    const doc = makeDoc([task])
    const result = checkDefinitionOfDone(doc, 'task_1')
    const check = result.checks.find((c) => c.name === 'has_testable_ac')
    expect(check).toBeDefined()
    expect(check!.passed).toBe(false)
    // must mention score or threshold or concrete quality
    expect(check!.details).toMatch(/score|60|weak|testável|testavel|concreto/i)
  })

  it('passes when at least 1 AC scores ≥ 60 (AC2)', () => {
    const task = makeNode('task_2', 'task', 'Strong AC node', {
      acceptanceCriteria: ['Given a valid POST /api/items with body When submitted Then returns 201 in under 200ms'],
    })
    const doc = makeDoc([task])
    const result = checkDefinitionOfDone(doc, 'task_2')
    const check = result.checks.find((c) => c.name === 'has_testable_ac')
    expect(check).toBeDefined()
    expect(check!.passed).toBe(true)
  })
})
