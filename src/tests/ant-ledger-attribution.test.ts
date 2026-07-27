/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes do node_aa91e9665ac2 (Swarm-B, NFR node_5a883cf0bbd9) — atribuição
 * REAL no llm_call_ledger no ciclo async: a linha carrega node_id + agent_id
 * + provider/model reportados pelo port + tokens>0; falha de gravação nunca
 * derruba a formiga (erro logado, ciclo segue).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { createBudgetGuard } from '../core/autonomy/budget-guard.js'
import { runAntCycle, type AntLlmPort } from '../swarming/ant-runner.js'
import { makeLlm } from '../swarming/provider-llm-adapter.js'
import type { GraphNode } from '../core/graph/graph-types.js'

const VALID = JSON.stringify({ arquivos: ['x.ts'], testes: { passed: 1, failed: 0 }, desvios: [] })

function stubWithIdentity(): AntLlmPort {
  return {
    async run() {
      return { text: VALID, inputTokens: 20, outputTokens: 8, provider: 'openrouter', model: 'deepseek/deepseek-chat' }
    },
  }
}

function addTask(store: SqliteStore, id: string): void {
  const now = new Date().toISOString()
  store.insertNode({
    id,
    type: 'task',
    title: `Task ${id}`,
    status: 'backlog',
    priority: 5,
    acceptanceCriteria: ['Given X, When Y, Then Z observable'],
    tags: [],
    createdAt: now,
    updatedAt: now,
  } as GraphNode)
}

let store: SqliteStore

beforeEach(() => {
  store = SqliteStore.open(':memory:')
  store.initProject('proj-ledger-attr')
})

afterEach(() => {
  store.close()
})

interface LedgerRow {
  node_id: string
  agent_id: string | null
  provider: string
  model: string
  input_tokens: number
  output_tokens: number
}

describe('atribuição por node/agent no ciclo async', () => {
  it('ciclo com provider identifica a linha: node_id + agent_id + provider/model do port + tokens>0 (AC1)', async () => {
    addTask(store, 'node_attr1')
    await runAntCycle({ store, llm: stubWithIdentity(), budget: createBudgetGuard(), agentId: 'formiga-x' })

    const row = store
      .getDb()
      .prepare(
        'SELECT node_id, agent_id, provider, model, input_tokens, output_tokens FROM llm_call_ledger WHERE node_id = ?',
      )
      .get('node_attr1') as LedgerRow
    expect(row).toBeTruthy()
    expect(row.agent_id).toBe('formiga-x')
    expect(row.provider).toBe('openrouter')
    expect(row.model).toBe('deepseek/deepseek-chat')
    expect(row.input_tokens).toBeGreaterThan(0)
    expect(row.output_tokens).toBeGreaterThan(0)
  })

  it('port sem identidade (caso de limite) → provider/model degradam a defaults, linha ainda atribuída', async () => {
    addTask(store, 'node_attr2')
    const bare: AntLlmPort = {
      async run() {
        return { text: VALID, inputTokens: 5, outputTokens: 2 }
      },
    }
    await runAntCycle({ store, llm: bare, budget: createBudgetGuard(), agentId: 'formiga-y' })
    const row = store
      .getDb()
      .prepare('SELECT agent_id, provider, model FROM llm_call_ledger WHERE node_id = ?')
      .get('node_attr2') as LedgerRow
    expect(row.agent_id).toBe('formiga-y')
    expect(row.provider).toBeTruthy()
    expect(row.model).toBeTruthy()
  })

  it('gravação do ledger falha (caso de erro) → ciclo NÃO derruba a formiga e a task fecha (AC3)', async () => {
    addTask(store, 'node_attr3')
    store.getDb().exec('DROP TABLE llm_call_ledger')
    const result = await runAntCycle({
      store,
      llm: stubWithIdentity(),
      budget: createBudgetGuard(),
      agentId: 'formiga-z',
    })
    expect(result.status).toBe('done')
    expect(store.getNodeById('node_attr3')?.status).toBe('done')
  })

  it('makeLlm propaga model do gateway no retorno do port (integração adapter→ledger)', async () => {
    const llm = makeLlm({
      client: {
        run: async () => ({ text: VALID, model: 'stub-model-9', tokensIn: 7, tokensOut: 3 }),
      },
    })
    const res = await llm.run({ tier: 'cheap', prompt: 'p', nodeId: 'n' })
    expect(res.model).toBe('stub-model-9')
    expect(res.provider).toBeTruthy()
  })
})
