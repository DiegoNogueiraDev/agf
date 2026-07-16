/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_ee660053a470 — runner da formiga: claim(lease) → brief → tier-por-casta →
 * execução (stub) → parse → close/blocked. Stub-LLM com contador de tokens +
 * store em memória. Prova atribuição por task no llm_call_ledger.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { createBudgetGuard } from '../core/autonomy/budget-guard.js'
import { runAntCycle, type AntLlmPort } from '../swarming/ant-runner.js'
import type { GraphNode } from '../core/graph/graph-types.js'
import type { ModelTier } from '../core/colony/task-caste.js'

const VALID_RESULT = JSON.stringify({ arquivos: ['x.ts'], testes: { passed: 1, failed: 0 }, desvios: [] })

/** Stub-LLM: conta chamadas e registra o último tier requisitado. */
function makeStub(text: string): AntLlmPort & { calls: number; lastTier?: ModelTier } {
  return {
    calls: 0,
    lastTier: undefined,
    async run(input) {
      this.calls++
      this.lastTier = input.tier
      return { text, inputTokens: 10, outputTokens: 5 }
    },
  }
}

function addMinimaTask(store: SqliteStore, id: string): void {
  const now = new Date().toISOString()
  store.insertNode({
    id,
    type: 'task',
    title: `Task ${id}`,
    status: 'backlog',
    priority: 5, // → casta minima → tier cheap
    acceptanceCriteria: ['Given X, When Y, Then a concrete observable outcome Z happens'],
    tags: [],
    createdAt: now,
    updatedAt: now,
  } as GraphNode)
}

describe('runAntCycle', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('ant-runner-test')
  })
  afterEach(() => {
    store.close()
  })

  it('AC1: 1 ciclo → task minima transita in_progress→done e o tier requisitado é cheap', async () => {
    addMinimaTask(store, 'node_1')
    const stub = makeStub(VALID_RESULT)
    const result = await runAntCycle({ store, llm: stub, budget: createBudgetGuard(), agentId: 'formiga-a' })
    expect(result.status).toBe('done')
    expect(result.nodeId).toBe('node_1')
    expect(stub.lastTier).toBe('cheap')
    expect(store.getNodeById('node_1')?.status).toBe('done')
  })

  it('AC2: o llm_call_ledger tem ≥1 linha com o node_id da task (atribuição por task)', async () => {
    addMinimaTask(store, 'node_2')
    await runAntCycle({ store, llm: makeStub(VALID_RESULT), budget: createBudgetGuard(), agentId: 'formiga-a' })
    const rows = store.getDb().prepare('SELECT node_id FROM llm_call_ledger WHERE node_id = ?').all('node_2')
    expect(rows.length).toBeGreaterThanOrEqual(1)
  })

  it('AC3: budget excedido → budget_exhausted sem nova chamada LLM (contador inalterado)', async () => {
    addMinimaTask(store, 'node_3')
    const stub = makeStub(VALID_RESULT)
    const budget = createBudgetGuard(10)
    budget.add(20) // já estourado antes do ciclo
    const result = await runAntCycle({ store, llm: stub, budget, agentId: 'formiga-a' })
    expect(result.status).toBe('budget_exhausted')
    expect(stub.calls).toBe(0)
    expect(store.getNodeById('node_3')?.status).toBe('backlog')
  })

  it('AC4: retorno fora do schema → task vai a blocked com finding (nunca done com alegação falsa)', async () => {
    addMinimaTask(store, 'node_4')
    const stub = makeStub('isto não é JSON de executor')
    const before = store.getNodesByStatus('risk' as never).length
    const result = await runAntCycle({ store, llm: stub, budget: createBudgetGuard(), agentId: 'formiga-a' })
    expect(result.status).toBe('blocked')
    expect(store.getNodeById('node_4')?.status).toBe('blocked')
    // um finding foi registrado (nó de risco/bug)
    const risks = store.queryNodes({ type: ['risk', 'bug'] }).nodes
    expect(risks.length).toBeGreaterThan(before)
  })
})
