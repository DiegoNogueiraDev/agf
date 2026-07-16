/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_5e91af9e646d — o bloco flow do envelope aparecia só em `agf context`;
 * `agf start` usava buildTaskContext direto. buildFlowAwareContext reusa o MESMO
 * caminho (applyFlowToCompact) para os dois. Flow OFF-default ⇒ byte-idêntico.
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { enableFlowConfig } from '../cli/shared/enable-flow.js'
import { insertEpisodicOutcome } from '../core/store/episodic-outcomes-store.js'
import { buildTaskContext } from '../core/context/compact-context.js'
import { buildFlowAwareContext } from '../cli/shared/flow-aware-context.js'
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
  store.initProject('start-flow-test')
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

describe('buildFlowAwareContext (agf start reusa o caminho flow do context)', () => {
  it('AC: flow OFF-default → sem bloco flow, byte-idêntico a buildTaskContext', () => {
    const store = SqliteStore.open(':memory:')
    seed(store)
    const result = buildFlowAwareContext(store, 't1')
    expect(result.flow).toBeUndefined()
    expect(JSON.stringify(result.context)).toBe(JSON.stringify(buildTaskContext(store, 't1')))
    store.close()
  })

  it('AC: flow ON + streak → o bloco flow aparece (mesmo caminho de agf context)', () => {
    const store = SqliteStore.open(':memory:')
    seed(store)
    enableFlowConfig(store)
    for (let i = 0; i < 5; i += 1) {
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
    const result = buildFlowAwareContext(store, 't1')
    expect(result.flow).toBeDefined()
    store.close()
  })
})
