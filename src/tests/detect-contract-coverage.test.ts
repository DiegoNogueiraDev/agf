/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_05cf12fa1679 — gap contract_coverage: a boundary task (rota/api/comando/
 * hook/WIRE:) with no implements/consumes edge to a contract node is backlog that
 * makes the executor invent the shape (Design by Contract, Meyer 1992). Report-only,
 * RECOMMENDED. Detector is pure/deterministic; registered in the gaps registry.
 */

import { describe, it, expect } from 'vitest'
import { detectContractCoverage } from '../core/gaps/detect-contract-coverage.js'
import { detectAllGaps } from '../core/gaps/index.js'
import type { GraphDocument, GraphNode, GraphEdge } from '../core/graph/graph-types.js'

function node(over: Partial<GraphNode> & { id: string }): GraphNode {
  const now = new Date().toISOString()
  return {
    id: over.id,
    type: 'task',
    title: over.id,
    status: 'backlog',
    priority: 3,
    acceptanceCriteria: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...over,
  } as GraphNode
}

function edge(from: string, to: string, relationType: GraphEdge['relationType']): GraphEdge {
  return { id: `${from}-${to}`, from, to, relationType, createdAt: new Date().toISOString() }
}

function doc(nodes: GraphNode[], edges: GraphEdge[] = []): GraphDocument {
  return { nodes, edges } as GraphDocument
}

describe('detectContractCoverage — boundary task without a contract', () => {
  it('AC1: a boundary WIRE task with no implements/consumes edge yields a recommended gap with applyVia', () => {
    const d = doc([
      node({ id: 'epic1', type: 'epic', title: 'Epic' }),
      node({ id: 't1', title: 'WIRE: rota /api/v1/x', parentId: 'epic1' }),
    ])
    const gaps = detectContractCoverage(d)
    expect(gaps).toHaveLength(1)
    expect(gaps[0]!.kind).toBe('contract_coverage')
    expect(gaps[0]!.severity).toBe('recommended')
    expect(gaps[0]!.nodeId).toBe('t1')
    const via = gaps[0]!.enrichment.applyVia.join(' ')
    expect(via).toContain('--type contract')
    expect(via).toContain('agf edge add')
    expect(via).toContain('epic1') // contract parented to the task's epic
  })

  it('AC2: the same task WITH an implements edge to a contract node yields no gap', () => {
    const d = doc(
      [node({ id: 'c1', type: 'contract', title: 'Contract' }), node({ id: 't1', title: 'WIRE: rota /api/v1/x' })],
      [edge('t1', 'c1', 'implements')],
    )
    expect(detectContractCoverage(d)).toHaveLength(0)
  })

  it('a consumes edge to a contract also satisfies the gap', () => {
    const d = doc(
      [node({ id: 'c1', type: 'contract', title: 'C' }), node({ id: 't1', title: 'comando cli novo' })],
      [edge('t1', 'c1', 'consumes')],
    )
    expect(detectContractCoverage(d)).toHaveLength(0)
  })

  it('an implements edge to a NON-contract node does NOT satisfy the gap', () => {
    const d = doc(
      [node({ id: 'x1', type: 'task', title: 'X' }), node({ id: 't1', title: 'WIRE: endpoint /health' })],
      [edge('t1', 'x1', 'implements')],
    )
    expect(detectContractCoverage(d)).toHaveLength(1)
  })

  it('AC3: a task without boundary keywords yields no gap', () => {
    const d = doc([node({ id: 't1', title: 'refactor internal helper for clarity' })])
    expect(detectContractCoverage(d)).toHaveLength(0)
  })

  it('does not false-positive on "api" inside a larger word', () => {
    const d = doc([node({ id: 't1', title: 'capitalize the rapid formatter output' })])
    expect(detectContractCoverage(d)).toHaveLength(0)
  })

  it('only fires on backlog tasks — an in_progress/done boundary task is skipped', () => {
    const d = doc([
      node({ id: 't1', title: 'WIRE: rota /api/v1/x', status: 'in_progress' }),
      node({ id: 't2', title: 'WIRE: rota /api/v1/y', status: 'done' }),
    ])
    expect(detectContractCoverage(d)).toHaveLength(0)
  })

  it('is registered in the gaps registry (agf gaps runs it)', () => {
    const d = doc([node({ id: 't1', title: 'WIRE: rota /api/v1/x' })])
    const gaps = detectAllGaps(d, ['contract_coverage'])
    expect(gaps.some((g) => g.kind === 'contract_coverage' && g.nodeId === 't1')).toBe(true)
  })
})
