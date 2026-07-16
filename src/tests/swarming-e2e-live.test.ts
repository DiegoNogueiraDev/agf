/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_d9a6bdcd6638 — E2E da colônia com stub async de provider: prova que
 * runColony executa tarefas SEM gastar key, que o ledger registra atribuição
 * e que falha em 1 formiga não trava a colônia.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { createBudgetGuard } from '../core/autonomy/budget-guard.js'
import { runColony } from '../swarming/run.js'
import type { AntLlmPort } from '../swarming/ant-runner.js'
import type { GraphNode } from '../core/graph/graph-types.js'

const VALID = JSON.stringify({ arquivos: ['x.ts'], testes: { passed: 1, failed: 0 }, desvios: [] })
const INVALID = 'not-json'

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

describe('runColony E2E (stub async provider)', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('swarm-e2e-live')
  })

  afterEach(() => {
    store.close()
  })

  it('AC1: 2 tasks + 2 ants → ambas done, ledger com 2 linhas e tokens>0', async () => {
    addTask(store, 'node_t1')
    addTask(store, 'node_t2')
    const stub = makeStubFactory()
    const result = await runColony({ store, makeLlm: stub.makeLlm, budget: createBudgetGuard(), ants: 2 })

    expect(result.tasksClosed).toBe(2)
    expect(store.getNodeById('node_t1')?.status).toBe('done')
    expect(store.getNodeById('node_t2')?.status).toBe('done')
    // ledger tem 2 linhas com tokens>0
    const rows = store.getDb().prepare('SELECT node_id, input_tokens, output_tokens FROM llm_call_ledger').all() as {
      node_id: string
      input_tokens: number
      output_tokens: number
    }[]
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.input_tokens + row.output_tokens).toBeGreaterThan(0)
    }
  })

  it('AC2: chamadas LLM == tasks executadas (stub sem rede)', async () => {
    addTask(store, 'node_t1')
    addTask(store, 'node_t2')
    addTask(store, 'node_t3')
    const stub = makeStubFactory()
    await runColony({ store, makeLlm: stub.makeLlm, budget: createBudgetGuard(), ants: 2 })

    expect(stub.calls()).toBe(3)
  })

  it('AC3: 1 task falha no parse (stub devolve JSON inválido) → a outra formiga continua', async () => {
    addTask(store, 'node_bad')
    addTask(store, 'node_good')
    const stub = {
      makeLlm: () => ({
        async run(input: { nodeId: string }) {
          return {
            text: input.nodeId === 'node_bad' ? INVALID : VALID,
            inputTokens: 10,
            outputTokens: 5,
          }
        },
      }),
      calls: 0,
    }
    const cols = () => store.getDb().prepare('SELECT COUNT(*) AS c FROM llm_call_ledger').get() as { c: number }

    const result = await runColony({ store, makeLlm: () => stub.makeLlm(), budget: createBudgetGuard(), ants: 2 })

    expect(result.tasksClosed).toBe(1)
    expect(result.tasksBlocked).toBe(1)
    expect(store.getNodeById('node_bad')?.status).toBe('blocked')
    expect(store.getNodeById('node_good')?.status).toBe('done')
    // ledger registrou só a chamada que passou (a bad nunca chamou LLM válido -> na verdade chama mas fica blocked)
    // Na real: ambas chamam LLM, gravação no ledger acontece ANTES do parse, então ambas geram linha.
    // O que importa é: colônia não travou, a boa fechou, a bad ficou blocked.
    expect(cols().c).toBe(2)
  })
})
