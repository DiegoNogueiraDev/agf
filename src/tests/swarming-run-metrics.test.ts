/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_14a674c6c580 — PROVA DE VALOR (regra 16): a colônia (`runColony`) atribui
 * tokens REAIS por task no llm_call_ledger, e `agf metrics` os expõe pelo caminho
 * do consumidor. Honestidade: cost_usd=0 no modo stub/delegate é CORRETO
 * (delegate-first); a prova é a ATRIBUIÇÃO (tokens>0 por node_id), não o custo $.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { createBudgetGuard } from '../core/autonomy/budget-guard.js'
import { runColony } from '../swarming/run.js'
import type { AntLlmPort } from '../swarming/ant-runner.js'
import type { GraphNode } from '../core/graph/graph-types.js'

const VALID = JSON.stringify({ arquivos: ['x.ts'], testes: { passed: 1, failed: 0 }, desvios: [] })
const stubFactory = (): AntLlmPort => ({
  run: async () => ({ text: VALID, inputTokens: 10, outputTokens: 5 }),
})

describe('prova de valor: runColony → ledger → agf metrics', () => {
  let dir: string

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-colony-proof-'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'colony-proof' })) // anchor p/ agf metrics
    const store = SqliteStore.open(dir)
    store.initProject('proof')
    const now = new Date().toISOString()
    for (const id of ['d1', 'd2', 'd3']) {
      store.insertNode({
        id,
        type: 'task',
        title: `Task ${id}`,
        status: 'backlog',
        priority: 5,
        acceptanceCriteria: ['Given X, When Y, Then a concrete observable outcome Z happens'],
        tags: [],
        createdAt: now,
        updatedAt: now,
      } as GraphNode)
    }
    await runColony({ store, makeLlm: stubFactory, budget: createBudgetGuard(), ants: 2 })
    store.close()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('runColony grava tokens>0 atribuídos por node_id (cost_usd=0 é correto em stub)', () => {
    const store = SqliteStore.open(dir)
    const rows = store
      .getDb()
      .prepare('SELECT node_id, input_tokens + output_tokens AS tok FROM llm_call_ledger WHERE node_id IS NOT NULL')
      .all() as Array<{ node_id: string; tok: number }>
    store.close()
    expect(rows.length).toBe(3) // 3 tasks fechadas por formigas
    for (const r of rows) {
      expect(['d1', 'd2', 'd3']).toContain(r.node_id)
      expect(r.tok).toBeGreaterThan(0) // atribuição real de tokens
    }
  })

  it('`agf metrics` (consumidor) lê o store e expõe tokens/task real (>0)', () => {
    const out = execSync(`npx tsx src/cli/index.ts metrics -d "${dir}" --select data`, {
      encoding: 'utf8',
      timeout: 30000,
    })
    const env = JSON.parse(out.trim().split('\n').pop() ?? '{}') as {
      ok: boolean
      data: { totals: { tokens: number; calls: number }; avgTokensPerTask: number; taskCount: number }
    }
    expect(env.ok).toBe(true)
    expect(env.data.totals.tokens).toBeGreaterThan(0)
    expect(env.data.avgTokensPerTask).toBeGreaterThan(0)
    expect(env.data.taskCount).toBe(3)
  })
})
