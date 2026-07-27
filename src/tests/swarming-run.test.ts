/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_d78cca9c2962 — `ant-swarming run`: orquestra a colônia pela fila com budget
 * global, sweep de leases e reclaim de órfãs, parando quando a fila seca. Compõe
 * runAntCycle (T4). Fixture: stub-LLM + grafo com 3 tasks + banco em memória.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { createBudgetGuard } from '../core/autonomy/budget-guard.js'
import { runColony } from '../swarming/run.js'
import type { AntLlmPort } from '../swarming/ant-runner.js'
import type { GraphNode } from '../core/graph/graph-types.js'

const VALID = JSON.stringify({ arquivos: ['x.ts'], testes: { passed: 1, failed: 0 }, desvios: [] })

/** Factory de stub-LLM que conta chamadas globais (para provar "não chamou LLM"). */
function makeStubFactory(): { makeLlm: () => AntLlmPort; calls: () => number } {
  let calls = 0
  return {
    makeLlm: () => ({
      async run() {
        calls++
        return { text: VALID, inputTokens: 10, outputTokens: 5 }
      },
    }),
    calls: () => calls,
  }
}

function addTask(store: SqliteStore, id: string, status: GraphNode['status'] = 'backlog'): void {
  const now = new Date().toISOString()
  store.insertNode({
    id,
    type: 'task',
    title: `Task ${id}`,
    status,
    priority: 5,
    acceptanceCriteria: ['Given X, When Y, Then a concrete observable outcome Z happens'],
    tags: [],
    createdAt: now,
    updatedAt: now,
  } as GraphNode)
}

describe('runColony', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('swarm-run-test')
  })
  afterEach(() => {
    store.close()
  })

  it('AC1: 3 tasks unblocked + 2 formigas → todas done, zero in_progress órfão', async () => {
    for (const id of ['node_1', 'node_2', 'node_3']) addTask(store, id)
    const stub = makeStubFactory()
    const result = await runColony({ store, makeLlm: stub.makeLlm, budget: createBudgetGuard(), ants: 2 })
    expect(result.tasksClosed).toBe(3)
    for (const id of ['node_1', 'node_2', 'node_3']) expect(store.getNodeById(id)?.status).toBe('done')
    expect(store.getNodesByStatus('in_progress')).toHaveLength(0)
  })

  it('AC2: task órfã (in_progress + lock expirado) volta ao pool no sweep e é completada', async () => {
    addTask(store, 'orphan', 'in_progress')
    // Simula formiga morta: lock com expires_at no passado.
    const past = new Date(Date.now() - 60_000).toISOString()
    store
      .getDb()
      .prepare(
        `INSERT INTO resource_locks (resource_id, resource_type, agent_id, lease_token, acquired_at, expires_at)
         VALUES ('orphan', 'task', 'formiga-morta', 'tok-1', ?, ?)`,
      )
      .run(past, past)

    const stub = makeStubFactory()
    const result = await runColony({ store, makeLlm: stub.makeLlm, budget: createBudgetGuard(), ants: 2 })
    expect(result.reclaimed).toBeGreaterThanOrEqual(1)
    expect(store.getNodeById('orphan')?.status).toBe('done')
  })

  it('AC3: fila vazia → encerra imediatamente com tasksClosed=0, sem spawn nem LLM', async () => {
    const stub = makeStubFactory()
    const result = await runColony({ store, makeLlm: stub.makeLlm, budget: createBudgetGuard(), ants: 2 })
    expect(result.tasksClosed).toBe(0)
    expect(result.rounds).toBe(0)
    expect(stub.calls()).toBe(0)
  })

  it('budget global esgotado → para (não fecha todas as 3)', async () => {
    for (const id of ['node_1', 'node_2', 'node_3']) addTask(store, id)
    const stub = makeStubFactory()
    const budget = createBudgetGuard(20) // ~1 ciclo (10+5=15/ciclo) antes de estourar
    const result = await runColony({ store, makeLlm: stub.makeLlm, budget, ants: 2 })
    expect(result.tasksClosed).toBeLessThan(3)
  })
})
