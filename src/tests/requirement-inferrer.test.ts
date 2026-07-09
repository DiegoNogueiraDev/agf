/*!
 * Task node_50904b575080 — requirement inferrer (edge implements).
 *
 * AC1: Given a task with no 'implements' edge but a sibling requirement with
 *      a common tag, When inferred, Then proposes 1 implements edge with reason.
 * AC2: Given a task already linked (has implements edge), When inferred,
 *      Then proposes nothing.
 */

import { describe, it, expect } from 'vitest'
import { inferRequirementEdges, type EdgeProposal } from '../core/gaps/requirement-inferrer.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'

const TS = new Date().toISOString()

function node(id: string, type: string, title: string, tags: string[] = []): GraphNode {
  return { id, type, title, status: 'in_progress', priority: 3, createdAt: TS, updatedAt: TS, tags }
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

describe('inferRequirementEdges', () => {
  it('proposes implements edge when task and sibling requirement share a tag (AC1)', () => {
    const req = node('req_1', 'requirement', 'Auth requirement', ['auth'])
    const task = node('task_1', 'task', 'Implement login', ['auth'])
    const doc = makeDoc([req, task])
    const proposals: EdgeProposal[] = inferRequirementEdges(doc, 'task_1')
    expect(proposals).toHaveLength(1)
    expect(proposals[0].from).toBe('task_1')
    expect(proposals[0].to).toBe('req_1')
    expect(proposals[0].relationType).toBe('implements')
    expect(typeof proposals[0].reason).toBe('string')
    expect(proposals[0].reason.length).toBeGreaterThan(0)
  })

  it('returns nothing when task already has an implements edge (AC2)', () => {
    const req = node('req_2', 'requirement', 'Auth requirement', ['auth'])
    const task = node('task_2', 'task', 'Implement login', ['auth'])
    const alreadyLinked = edge('task_2', 'req_2', 'implements')
    const doc = makeDoc([req, task], [alreadyLinked])
    const proposals = inferRequirementEdges(doc, 'task_2')
    expect(proposals).toHaveLength(0)
  })

  it('returns nothing when no common tags exist', () => {
    const req = node('req_3', 'requirement', 'Payment requirement', ['payments'])
    const task = node('task_3', 'task', 'Implement login', ['auth'])
    const doc = makeDoc([req, task])
    const proposals = inferRequirementEdges(doc, 'task_3')
    expect(proposals).toHaveLength(0)
  })
})
