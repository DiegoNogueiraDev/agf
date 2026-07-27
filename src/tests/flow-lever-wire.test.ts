/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * F1 — flow is a MEASURED lever. With flow on + a success streak, applyFlowToCompact
 * produces a real input-token cut, and recording it (as `agf context` now does)
 * lands a `flow` row in economy_lever_ledger → visible to `agf savings`. With flow
 * off → null → no lever (legacy, non-regression).
 */
import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { applyFlowToCompact } from '../core/context/flow-compact.js'
import { enableFlowConfig } from '../cli/shared/enable-flow.js'
import { insertEpisodicOutcome } from '../core/store/episodic-outcomes-store.js'
import { recordLeverEvent, summarizeByLever } from '../core/economy/economy-lever-ledger.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'

const iso = (): string => new Date(0).toISOString()
const node = (id: string, type: GraphNode['type'], title: string, extra: Partial<GraphNode> = {}): GraphNode => ({
  id,
  type,
  title,
  status: 'backlog',
  priority: 3,
  createdAt: iso(),
  updatedAt: iso(),
  ...extra,
})

function seed(store: SqliteStore): void {
  store.initProject('flow-lever-test')
  const nodes: GraphNode[] = [
    node('t1', 'task', 'Build adder', { description: 'core', acceptanceCriteria: ['2+2=4'] }),
    node('c1', 'constraint', 'No external libs'),
    node('r1', 'risk', 'Integer overflow'),
    node('t2', 'task', 'Peripheral neighbour', { description: 'x'.repeat(400) }),
  ]
  const edges: GraphEdge[] = [
    { id: 'e1', from: 't1', to: 'c1', relationType: 'related_to', createdAt: iso() },
    { id: 'e2', from: 't1', to: 'r1', relationType: 'related_to', createdAt: iso() },
    { id: 'e3', from: 't1', to: 't2', relationType: 'related_to', createdAt: iso() },
  ]
  store.bulkInsert(nodes, edges)
}

function seedSuccesses(store: SqliteStore, n: number): void {
  for (let i = 0; i < n; i += 1) {
    insertEpisodicOutcome(store.getDb(), {
      id: `epi_${i}`,
      nodeId: 't1',
      taskType: '',
      tags: '',
      approachSummary: '',
      outcome: 'success',
      cycleTimeDelta: 0,
      reopenCount: 0,
      createdAt: i + 1,
    })
  }
}

describe('flow lever wiring (F1)', () => {
  it('flow on + success streak → tokensSaved>0 recorded as a `flow` lever in savings', () => {
    const store = SqliteStore.open(':memory:')
    seed(store)
    enableFlowConfig(store)
    seedSuccesses(store, 5)

    const flow = applyFlowToCompact(store, 't1')
    expect(flow).not.toBeNull()
    if (!flow) return
    expect(flow.flow.tokensSaved).toBeGreaterThan(0)

    // exactly what context-cmd does on the saved>0 branch:
    recordLeverEvent(store.getDb(), {
      sessionId: 'context_t1',
      nodeId: 't1',
      lever: 'flow',
      tokensBefore: flow.flow.tokensBaseline,
      tokensAfter: flow.flow.tokensActual,
      saved: flow.flow.tokensSaved,
      accepted: true,
      gateOutcome: 'accepted',
      score: flow.flow.phi,
    })

    const byLever = Object.fromEntries(summarizeByLever(store.getDb()).map((r) => [r.lever, r.totalSaved]))
    expect(byLever.flow).toBe(flow.flow.tokensSaved)
    store.close()
  })

  it('flow off (default) → null → no lever recorded (non-regression)', () => {
    const store = SqliteStore.open(':memory:')
    seed(store)
    expect(applyFlowToCompact(store, 't1')).toBeNull()
    expect(summarizeByLever(store.getDb()).length).toBe(0)
    store.close()
  })
})
