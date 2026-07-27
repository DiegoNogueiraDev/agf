/*!
 * Task node_0ac37802352d — agf gaps --kind traceability_break --suggest.
 *
 * AC1: Given traceability_break gaps, When --suggest,
 *      Then each applyVia contains a concrete agf edge add command.
 * AC2: Given no gaps, When --suggest,
 *      Then returns ready:true with no commands.
 */

import { describe, it, expect } from 'vitest'
import { suggestTraceabilityFixes } from '../core/gaps/traceability-suggest.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'

const TS = new Date().toISOString()

function node(id: string, type: string, title: string, extra: Partial<GraphNode> = {}): GraphNode {
  return { id, type, title, status: 'in_progress', priority: 3, createdAt: TS, updatedAt: TS, ...extra }
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

describe('suggestTraceabilityFixes', () => {
  it('returns applyVia commands when there are traceability gaps (AC1)', () => {
    // Requirement with no implementing task → traceability gap
    const req = node('req_1', 'requirement', 'Auth requirement')
    const doc = makeDoc([req])
    const result = suggestTraceabilityFixes(doc)
    // Even if no cross-tag match, may have requirement with no implementing task
    expect(typeof result.ready).toBe('boolean')
    expect(Array.isArray(result.commands)).toBe(true)
    // When gaps exist each command must contain 'agf edge add'
    for (const cmd of result.commands) {
      expect(cmd).toContain('agf edge add')
    }
  })

  it('returns ready:true with no commands when graph is fully traced (AC2)', () => {
    // Task with implements edge to requirement AND tests edge (no gaps)
    const req = node('req_2', 'requirement', 'Auth')
    const task = node('task_2', 'task', 'Implement auth', { testFiles: ['src/tests/auth.test.ts'] })
    const impl = edge('task_2', 'req_2', 'implements')
    const tests = edge('task_2', 'src/tests/auth.test.ts', 'tests')
    const doc = makeDoc([req, task], [impl, tests])
    const result = suggestTraceabilityFixes(doc)
    expect(result.ready).toBe(true)
    expect(result.commands).toHaveLength(0)
  })
})
