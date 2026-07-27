/*!
 * TDD: stale-risk surfacing in agf insights (node_cd96aaf68985).
 *
 * AC1: risks with varied ages → staleCount and openCount returned.
 * AC2: no stale risks → staleRisks list is empty (no false positive).
 */

import { describe, it, expect } from 'vitest'
import {
  computeStaleRisks,
  detectResolvedRisks,
  type RiskRecord,
  type ResolvableRiskNode,
} from '../core/insights/stale-risk.js'

const DAY_MS = 24 * 60 * 60 * 1000

function daysAgo(n: number): string {
  return new Date(Date.now() - n * DAY_MS).toISOString()
}

describe('AC1: staleCount and openCount with varied ages', () => {
  it('returns correct counts when some risks exceed threshold', () => {
    const risks: RiskRecord[] = [
      { id: 'r1', title: 'risk A', updatedAt: daysAgo(10) },
      { id: 'r2', title: 'risk B', updatedAt: daysAgo(3) },
      { id: 'r3', title: 'risk C', updatedAt: daysAgo(20) },
    ]
    const result = computeStaleRisks(risks, { staleDays: 7 })
    expect(result.openCount).toBe(3)
    expect(result.staleCount).toBe(2)
    expect(result.staleRisks.map((r) => r.id)).toEqual(['r1', 'r3'])
  })
})

describe('AC2: no stale risks → staleRisks list is empty', () => {
  it('returns empty staleRisks when all are within threshold', () => {
    const risks: RiskRecord[] = [
      { id: 'r1', title: 'risk A', updatedAt: daysAgo(1) },
      { id: 'r2', title: 'risk B', updatedAt: daysAgo(2) },
    ]
    const result = computeStaleRisks(risks, { staleDays: 7 })
    expect(result.staleRisks).toHaveLength(0)
    expect(result.staleCount).toBe(0)
    expect(result.openCount).toBe(2)
  })
})

describe('node_6d11e167c53d: detectResolvedRisks false-positive fix', () => {
  function node(overrides: Partial<ResolvableRiskNode>): ResolvableRiskNode {
    return { id: 'n1', type: 'risk', title: 'Some risk', status: 'backlog', ...overrides }
  }

  it('detects a genuine leading resolved marker', () => {
    const nodes = [node({ description: 'RESOLVIDO: fix shipped in commit abc123.' })]
    expect(detectResolvedRisks(nodes)).toHaveLength(1)
  })

  it('detects an explicit "Status: resolved" label anywhere in the text', () => {
    const nodes = [node({ description: 'Long context paragraph first.\n\nStatus: done — see PR #42.' })]
    expect(detectResolvedRisks(nodes)).toHaveLength(1)
  })

  it('does NOT flag "done" appearing in unrelated prose (real false positive #1)', () => {
    const nodes = [node({ description: 'Achado: done claims não verificáveis em vários nodes do grafo.' })]
    expect(detectResolvedRisks(nodes)).toHaveLength(0)
  })

  it('does NOT flag "done" describing another system\'s task count (real false positive #2)', () => {
    const nodes = [node({ description: 'O epic tem 10 ou mais tasks done, mas o proprio epico segue backlog.' })]
    expect(detectResolvedRisks(nodes)).toHaveLength(0)
  })

  it('does NOT flag "done" inside a rhetorical question about another system (real false positive #3)', () => {
    const nodes = [node({ description: 'Por que o gate marca done quando os testes falham? Investigar done-cmd.ts.' })]
    expect(detectResolvedRisks(nodes)).toHaveLength(0)
  })

  it('still ignores nodes whose status already transitioned to done/cancelled', () => {
    const nodes = [node({ status: 'done', description: 'RESOLVIDO: already closed.' })]
    expect(detectResolvedRisks(nodes)).toHaveLength(0)
  })
})
