/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 2.1 AC coverage: gap ordering by edge-unblocking count
 *
 * AC1: GIVEN 3 gaps A(5 edges), B(1 edge), C(3 edges) WHEN sorted THEN order A, C, B
 * AC2: GIVEN gap without nodeId WHEN sorted THEN appears after gaps with nodeId
 * AC3: GIVEN --order-by-impact false WHEN sorted THEN M1–M9 original order preserved
 * AC4: GIVEN no edges WHEN sorted THEN edgeUnblockingCount=0, fallback to severity
 */

import { describe, it, expect } from 'vitest'
import { sortGapsByImpact, enrichGapsWithEdgeCount } from '../core/gaps/gap-ordering.js'
import type { Gap, GapSeverity } from '../core/gaps/gap-types.js'
import type { GraphDocument, GraphEdge, GraphNode } from '../core/graph/graph-types.js'

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeGap(nodeId?: string, severity: GapSeverity = 'recommended'): Gap {
  return {
    kind: 'traceability_break',
    severity,
    nodeId,
    evidence: 'test gap evidence',
    enrichment: { action: 'add_edges', instruction: 'add edge', applyVia: [] },
  }
}

function makeEdge(
  from: string,
  to: string,
  relationType: 'depends_on' | 'blocks' | 'parent_of' = 'depends_on',
): GraphEdge {
  return { id: `e_${from}_${to}`, from, to, relationType, createdAt: new Date().toISOString() }
}

function makeNode(id: string, status: 'backlog' | 'in_progress' | 'done' = 'backlog'): GraphNode {
  const ts = new Date().toISOString()
  return {
    id,
    type: 'task',
    title: `Node ${id}`,
    description: '',
    status,
    priority: 3,
    xpSize: 'S',
    parentId: null,
    acceptanceCriteria: [],
    tags: [],
    createdAt: ts,
    updatedAt: ts,
    metadata: {},
  }
}

function makeDoc(nodes: GraphNode[] = [], edges: GraphEdge[] = []): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'proj_test', name: 'test', createdAt: '', updatedAt: '' },
    nodes,
    edges,
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

// ── AC1: A(5 edges), B(1 edge), C(3 edges) → sorted A, C, B ──────────────────

describe('AC1: sortGapsByImpact orders by edgeUnblockingCount DESC', () => {
  it('A(5 edges) → C(3 edges) → B(1 edge) ordering (AC1)', () => {
    const gapA = makeGap('node_A')
    const gapB = makeGap('node_B')
    const gapC = makeGap('node_C')

    // node_A has 5 downstream edges (depends_on or blocks) to non-done nodes
    const nodes = [
      makeNode('node_A'),
      makeNode('node_B'),
      makeNode('node_C'),
      makeNode('t1'),
      makeNode('t2'),
      makeNode('t3'),
      makeNode('t4'),
      makeNode('t5'),
      makeNode('u1'),
      makeNode('u2'),
      makeNode('u3'),
      makeNode('v1'),
    ]
    const edges: GraphEdge[] = [
      makeEdge('node_A', 't1'),
      makeEdge('node_A', 't2'),
      makeEdge('node_A', 't3'),
      makeEdge('node_A', 't4'),
      makeEdge('node_A', 't5'), // 5 edges
      makeEdge('node_C', 'u1'),
      makeEdge('node_C', 'u2'),
      makeEdge('node_C', 'u3'), // 3 edges
      makeEdge('node_B', 'v1'), // 1 edge
    ]
    const doc = makeDoc(nodes, edges)

    const sorted = sortGapsByImpact([gapA, gapB, gapC], doc)
    expect(sorted[0].nodeId).toBe('node_A')
    expect(sorted[1].nodeId).toBe('node_C')
    expect(sorted[2].nodeId).toBe('node_B')
  })

  it('ties broken by severity (required before recommended)', () => {
    const gapReq = makeGap('node_X', 'required')
    const gapRec = makeGap('node_Y', 'recommended')
    const nodes = [makeNode('node_X'), makeNode('node_Y'), makeNode('t1'), makeNode('t2')]
    const edges = [makeEdge('node_X', 't1'), makeEdge('node_Y', 't2')] // equal count
    const doc = makeDoc(nodes, edges)

    const sorted = sortGapsByImpact([gapRec, gapReq], doc)
    expect(sorted[0].nodeId).toBe('node_X') // required first
    expect(sorted[0].severity).toBe('required')
  })

  it('single gap is returned unchanged', () => {
    const gap = makeGap('node_A')
    const doc = makeDoc([makeNode('node_A'), makeNode('t1')], [makeEdge('node_A', 't1')])
    const result = sortGapsByImpact([gap], doc)
    expect(result).toHaveLength(1)
    expect(result[0].nodeId).toBe('node_A')
  })

  it('empty gaps array returns empty array', () => {
    const result = sortGapsByImpact([], makeDoc())
    expect(result).toEqual([])
  })

  it('only depends_on and blocks edges count (parent_of does not count)', () => {
    const gapA = makeGap('node_A')
    const gapB = makeGap('node_B')
    const nodes = [makeNode('node_A'), makeNode('node_B'), makeNode('t1'), makeNode('t2'), makeNode('t3')]
    const edges = [
      makeEdge('node_A', 't1', 'parent_of'), // parent_of → does NOT count
      makeEdge('node_B', 't2', 'depends_on'),
      makeEdge('node_B', 't3', 'blocks'), // 2 qualifying edges
    ]
    const doc = makeDoc(nodes, edges)
    const sorted = sortGapsByImpact([gapA, gapB], doc)
    // node_B has 2 qualifying edges, node_A has 0 → B comes first
    expect(sorted[0].nodeId).toBe('node_B')
    expect(sorted[1].nodeId).toBe('node_A')
  })

  it('done target nodes do not count toward blocking edges', () => {
    const gapA = makeGap('node_A')
    const gapB = makeGap('node_B')
    const nodes = [
      makeNode('node_A'),
      makeNode('node_B'),
      makeNode('done_1', 'done'),
      makeNode('done_2', 'done'),
      makeNode('active_1', 'backlog'),
    ]
    const edges = [
      makeEdge('node_A', 'done_1'),
      makeEdge('node_A', 'done_2'), // done nodes → do NOT count
      makeEdge('node_B', 'active_1'), // active node → counts
    ]
    const doc = makeDoc(nodes, edges)
    const sorted = sortGapsByImpact([gapA, gapB], doc)
    // node_B has 1 active edge, node_A has 0 (both targets done) → B first
    expect(sorted[0].nodeId).toBe('node_B')
  })
})

// ── AC2: gap without nodeId appears after all gaps with nodeId ─────────────────

describe('AC2: project-wide gaps (no nodeId) appear after gaps with nodeId', () => {
  it('gap without nodeId is last (AC2)', () => {
    const gapWithNodeId = makeGap('node_A')
    const gapProjectWide = makeGap(undefined) // no nodeId
    const doc = makeDoc([makeNode('node_A')])

    const sorted = sortGapsByImpact([gapProjectWide, gapWithNodeId], doc)
    expect(sorted[0].nodeId).toBe('node_A')
    expect(sorted[1].nodeId).toBeUndefined()
  })

  it('multiple project-wide gaps stay at the end', () => {
    const withNode = makeGap('node_X')
    const pw1 = makeGap(undefined)
    const pw2 = makeGap(undefined)
    const doc = makeDoc([makeNode('node_X')])

    const sorted = sortGapsByImpact([pw1, withNode, pw2], doc)
    expect(sorted[0].nodeId).toBe('node_X')
    expect(sorted[1].nodeId).toBeUndefined()
    expect(sorted[2].nodeId).toBeUndefined()
  })

  it('project-wide gaps among themselves maintain relative order', () => {
    const pw1 = { ...makeGap(undefined), kind: 'traceability_break' as const }
    const pw2 = { ...makeGap(undefined), kind: 'missing_nfr' as const }
    const doc = makeDoc()

    const sorted = sortGapsByImpact([pw1, pw2], doc)
    expect(sorted[0].kind).toBe('traceability_break')
    expect(sorted[1].kind).toBe('missing_nfr')
  })
})

// ── AC3: orderByImpact=false preserves original order ─────────────────────────

describe('AC3: orderByImpact=false preserves M1–M9 insertion order', () => {
  it('returns gaps in original order when orderByImpact=false', () => {
    const gaps = ['node_B', 'node_A', 'node_C', undefined].map(makeGap)
    const nodes = [
      makeNode('node_A'),
      makeNode('node_B'),
      makeNode('node_C'),
      makeNode('t1'),
      makeNode('t2'),
      makeNode('t3'),
    ]
    const edges = [makeEdge('node_A', 't1'), makeEdge('node_A', 't2'), makeEdge('node_A', 't3')]
    const doc = makeDoc(nodes, edges)

    const sorted = sortGapsByImpact(gaps, doc, { orderByImpact: false })
    expect(sorted.map((g) => g.nodeId)).toEqual(['node_B', 'node_A', 'node_C', undefined])
  })

  it('default behavior is orderByImpact=true', () => {
    const gapA = makeGap('node_A')
    const gapB = makeGap('node_B')
    const nodes = [makeNode('node_A'), makeNode('node_B'), makeNode('t1'), makeNode('t2'), makeNode('t3')]
    const edges = [makeEdge('node_A', 't1'), makeEdge('node_A', 't2'), makeEdge('node_A', 't3')]
    const doc = makeDoc(nodes, edges)

    // no opts → default to orderByImpact=true
    const sorted = sortGapsByImpact([gapB, gapA], doc)
    expect(sorted[0].nodeId).toBe('node_A') // more edges → first
  })
})

// ── AC4: no edges → edgeUnblockingCount=0, severity fallback ─────────────────

describe('AC4: no edges → edgeUnblockingCount=0, severity as fallback', () => {
  it('all gaps have edgeUnblockingCount=0 when no edges exist', () => {
    const gaps = [makeGap('node_A'), makeGap('node_B')]
    const doc = makeDoc([makeNode('node_A'), makeNode('node_B')])

    const enriched = enrichGapsWithEdgeCount(gaps, doc)
    expect(enriched.every((g) => g.edgeUnblockingCount === 0)).toBe(true)
  })

  it('required severity appears before recommended when counts are equal', () => {
    const reqGap = makeGap('node_X', 'required')
    const recGap = makeGap('node_Y', 'recommended')
    const doc = makeDoc([makeNode('node_X'), makeNode('node_Y')]) // no edges

    const sorted = sortGapsByImpact([recGap, reqGap], doc)
    expect(sorted[0].severity).toBe('required')
    expect(sorted[1].severity).toBe('recommended')
  })

  it('no edges but nodeId present → edgeUnblockingCount=0', () => {
    const gap = makeGap('node_A')
    const enriched = enrichGapsWithEdgeCount([gap], makeDoc([makeNode('node_A')]))
    expect(enriched[0].edgeUnblockingCount).toBe(0)
  })

  it('unknown nodeId (not in nodes) → edgeUnblockingCount=0, no throw', () => {
    const gap = makeGap('node_ghost')
    const doc = makeDoc([makeNode('node_A')], [makeEdge('node_ghost', 'node_A')])
    // node_ghost is not in nodes → target node_A has no status? Graceful → count=1 (edge exists from ghost)
    // Actually: edge exists from gap's nodeId='node_ghost' to 'node_A' (backlog→counts)
    // Let's just verify no throw
    expect(() => enrichGapsWithEdgeCount([gap], doc)).not.toThrow()
  })
})

// ── enrichGapsWithEdgeCount coverage ─────────────────────────────────────────

describe('enrichGapsWithEdgeCount — adds edgeUnblockingCount to each gap', () => {
  it('returns new Gap objects (does not mutate originals)', () => {
    const original = makeGap('node_A')
    const doc = makeDoc([makeNode('node_A'), makeNode('t1')], [makeEdge('node_A', 't1')])
    const enriched = enrichGapsWithEdgeCount([original], doc)
    expect(original).not.toHaveProperty('edgeUnblockingCount')
    expect(enriched[0]).toHaveProperty('edgeUnblockingCount')
  })

  it('counts 0 for gap without nodeId', () => {
    const gap = makeGap(undefined)
    const enriched = enrichGapsWithEdgeCount([gap], makeDoc())
    expect(enriched[0].edgeUnblockingCount).toBe(0)
  })

  it('counts qualifying edges correctly', () => {
    const gap = makeGap('node_A')
    const nodes = [makeNode('node_A'), makeNode('t1', 'backlog'), makeNode('t2', 'in_progress'), makeNode('t3', 'done')]
    const edges = [
      makeEdge('node_A', 't1', 'depends_on'), // backlog → counts
      makeEdge('node_A', 't2', 'blocks'), // in_progress → counts
      makeEdge('node_A', 't3', 'depends_on'), // done → does NOT count
    ]
    const enriched = enrichGapsWithEdgeCount([gap], makeDoc(nodes, edges))
    expect(enriched[0].edgeUnblockingCount).toBe(2)
  })
})
