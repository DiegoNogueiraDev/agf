/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_0d1ddec8e534 — detect stale_resolved_risk in agf heal.
 * Risk/blocker nodes with 'RESOLVIDO'/'done'/'fixed' in the description but
 * status still backlog/open were only caught when someone manually ran
 * `agf insights bottlenecks`. This is a new detector wired into
 * monitorGraph (the same MAPE-K "Monitor" pass every other heal detector
 * lives in), reusing detectResolvedRisks (stale-risk.ts — extended, not
 * recreated) for the pure text-matching logic.
 */

import { describe, it, expect } from 'vitest'
import { monitorGraph, DEFAULT_HEALING_CONFIG } from '../core/skills/self-healing-engine.js'
import { detectResolvedRisks } from '../core/insights/stale-risk.js'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'

const NOW = new Date().toISOString()

function makeDoc(nodes: GraphNode[] = []): GraphDocument {
  return {
    version: '1',
    project: { id: 'p1', name: 'test', createdAt: NOW, updatedAt: NOW },
    nodes,
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

function makeRiskNode(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    type: 'risk',
    title: `Risk ${id}`,
    status: 'backlog',
    priority: 3,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

describe('detectResolvedRisks (pure, stale-risk.ts)', () => {
  it("GIVEN a risk with description containing 'RESOLVIDO' and status='backlog' THEN flagged", () => {
    const doc = makeDoc([makeRiskNode('r1', { description: 'RESOLVIDO em commit abc123' })])
    const flagged = detectResolvedRisks(doc.nodes)
    expect(flagged).toHaveLength(1)
    expect(flagged[0].id).toBe('r1')
  })

  it("GIVEN a risk with description containing 'RESOLVIDO' and status='done' THEN NOT flagged (already resolved in status)", () => {
    const doc = makeDoc([makeRiskNode('r2', { description: 'RESOLVIDO em commit abc123', status: 'done' })])
    expect(detectResolvedRisks(doc.nodes)).toHaveLength(0)
  })

  it("GIVEN a risk with description 'investigate X' (no resolved marker) and status='backlog' THEN NOT flagged", () => {
    const doc = makeDoc([makeRiskNode('r3', { description: 'investigate X further' })])
    expect(detectResolvedRisks(doc.nodes)).toHaveLength(0)
  })

  it("recognizes 'fixed', 'wontfix', 'duplicate', 'n/a' markers too", () => {
    const doc = makeDoc([
      makeRiskNode('r4', { description: 'fixed by node_abc' }),
      makeRiskNode('r5', { description: 'wontfix — not worth pursuing' }),
      makeRiskNode('r6', { description: 'duplicate of node_xyz' }),
      makeRiskNode('r7', { description: 'n/a — no longer applicable' }),
    ])
    expect(detectResolvedRisks(doc.nodes)).toHaveLength(4)
  })

  it('only considers risk/blocker-tagged nodes, not arbitrary tasks', () => {
    const doc = makeDoc([{ ...makeRiskNode('t1'), type: 'task', description: 'RESOLVIDO already' }])
    expect(detectResolvedRisks(doc.nodes)).toHaveLength(0)
  })
})

describe('monitorGraph — wires stale_resolved_risk as a MAPE-K issue', () => {
  it("reports a stale_resolved_risk issue for a risk with 'RESOLVIDO' still in backlog", () => {
    const doc = makeDoc([makeRiskNode('r1', { description: 'RESOLVIDO em commit abc123' })])
    const issues = monitorGraph(doc, DEFAULT_HEALING_CONFIG)
    const found = issues.find((i) => i.type === 'stale_resolved_risk')
    expect(found).toBeDefined()
    expect(found?.nodeId).toBe('r1')
  })

  it('reports no stale_resolved_risk issue when the risk is genuinely done', () => {
    const doc = makeDoc([makeRiskNode('r2', { description: 'RESOLVIDO em commit abc123', status: 'done' })])
    const issues = monitorGraph(doc, DEFAULT_HEALING_CONFIG)
    expect(issues.some((i) => i.type === 'stale_resolved_risk')).toBe(false)
  })
})
