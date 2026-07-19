/*!
 * Task node_c116e68f6d15 — exemption of container epics from AC gap checks.
 *
 * AC1: Given an epic with no AC, When agf gaps, Then NOT reported in
 *      ac_coverage_break nor weak_ac_testability.
 * AC2: Given a task with no AC, When agf gaps, Then IS reported.
 */

import { describe, it, expect } from 'vitest'
import { detectAcCoverage } from '../core/gaps/detect-ac-coverage.js'
import { detectWeakAc } from '../core/gaps/detect-weak-ac.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'

const TS = new Date().toISOString()

function node(id: string, type: string, extra: Partial<GraphNode> = {}): GraphNode {
  return { id, type, title: `Node ${id}`, status: 'in_progress', priority: 3, createdAt: TS, updatedAt: TS, ...extra }
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

describe('container epic exemption', () => {
  it('epic with no AC is NOT reported in ac_coverage_break (AC1)', () => {
    const epic = node('epic_1', 'epic')
    const child = node('task_1', 'task', { parentId: 'epic_1' })
    const doc = makeDoc([epic, child], [edge('epic_1', 'task_1', 'parent_of')])
    const gaps = detectAcCoverage(doc)
    const epicGaps = gaps.filter((g) => g.nodeId === 'epic_1')
    expect(epicGaps).toHaveLength(0)
  })

  it('epic with no AC is NOT reported in weak_ac_testability (AC1)', () => {
    const epic = node('epic_1', 'epic')
    const doc = makeDoc([epic])
    const gaps = detectWeakAc(doc)
    const epicGaps = gaps.filter((g) => g.nodeId === 'epic_1')
    expect(epicGaps).toHaveLength(0)
  })

  it('task with no AC IS reported (AC2)', () => {
    // Task with a weak/empty AC will be flagged
    const task = node('task_2', 'task', { acceptanceCriteria: ['it works'] })
    const doc = makeDoc([task])
    const gaps = detectWeakAc(doc)
    expect(gaps.some((g) => g.nodeId === 'task_2')).toBe(true)
  })
})
