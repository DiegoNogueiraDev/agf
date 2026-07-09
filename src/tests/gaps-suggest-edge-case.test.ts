/*!
 * Task node_5ed1f87f2248 — agf gaps --kind missing_edge_case --suggest <id>
 *
 * AC1: Given a node flagged by missing_edge_case, When --suggest,
 *      Then lists at least 1 stub and the exact agf node applyVia command.
 * AC2: Given a node NOT flagged, When --suggest,
 *      Then returns code NO_GAP.
 */

import { describe, it, expect } from 'vitest'
import { suggestEdgeCaseStubs } from '../core/gaps/suggest-edge-case.js'
import type { GraphNode } from '../core/graph/graph-types.js'

const TS = new Date().toISOString()

function makeNode(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    type: 'task',
    title: 'My task',
    status: 'in_progress',
    priority: 3,
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  }
}

function makeDoc(nodes: GraphNode[]) {
  return {
    version: '1.0.0',
    project: { id: 'proj_test', name: 'Test', createdAt: TS },
    nodes,
    edges: [],
    indexes: { byId: {} as Record<string, GraphNode> },
    meta: {},
  }
}

describe('suggestEdgeCaseStubs', () => {
  it('returns stubs and applyVia when node has missing_edge_case gap (AC1)', () => {
    // Happy-path-only AC (no error/boundary signal) → triggers missing_edge_case
    const node = makeNode('task_ec1', {
      acceptanceCriteria: ['Given valid input, When submitted, Then returns success'],
    })
    const doc = makeDoc([node])
    const result = suggestEdgeCaseStubs(doc, 'task_ec1')
    expect(result.code).not.toBe('NO_GAP')
    expect(result.stubs.length).toBeGreaterThanOrEqual(1)
    // applyVia must reference the exact node id
    expect(result.applyVia.length).toBeGreaterThanOrEqual(1)
    expect(result.applyVia[0]).toContain('task_ec1')
    expect(result.applyVia[0]).toContain('agf')
  })

  it('returns NO_GAP when node has concrete edge-case ACs (AC2)', () => {
    const node = makeNode('task_ec2', {
      acceptanceCriteria: [
        'When empty input submitted, Then error 400 returned',
        'When null id provided, Then error handled gracefully',
        'When value exceeds limit 100, Then capped at 100',
      ],
    })
    const doc = makeDoc([node])
    const result = suggestEdgeCaseStubs(doc, 'task_ec2')
    expect(result.code).toBe('NO_GAP')
    expect(result.stubs).toHaveLength(0)
  })
})
