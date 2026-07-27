/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * WS-A — integridade da medição. Cobre a costura única de economia:
 *  - recordSavingsEvents atribui o lever por entry (artifact_reuse, repo_map) e
 *    cai para response_cache quando ausente (T1.6/T1.7).
 *  - persistLedger grava chamadas de modelo E economia atomicamente, sem
 *    duplicar nem criar linhas de chamada para entries sintéticas (lever).
 *  - buildRepoMap expõe o baseline dump-all (fullEstimated) p/ o lever repo_map (T1.8).
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { TokenLedger } from '../core/autonomy/token-ledger.js'
import { persistLedger } from '../core/observability/llm-call-ledger.js'
import { recordSavingsEvents, summarizeByLever } from '../core/economy/economy-lever-ledger.js'
import { buildRepoMap } from '../core/context/repo-map.js'

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

describe('recordSavingsEvents — atribuição por lever', () => {
  it('rotula cada economia pelo seu lever e cai p/ response_cache quando ausente', () => {
    const db = freshDb()
    const ledger = new TokenLedger()
    // hit de cache de resposta (sem lever) → response_cache
    ledger.record('n1', { model: 'sonnet', tokensIn: 0, tokensOut: 0, fromCache: true, savedTokens: 120 })
    // exact-hit do ArtifactCache (A1)
    ledger.record('n1', { model: 'sonnet', tokensIn: 0, tokensOut: 0, savedTokens: 50, lever: 'artifact_reuse' })
    // corte de input do repo-map (A3)
    ledger.record('n2', { model: '(repo-map)', tokensIn: 0, tokensOut: 0, savedTokens: 300, lever: 'repo_map' })
    // chamada real → sem economia, ignorada
    ledger.record('n2', { model: 'sonnet', tokensIn: 100, tokensOut: 40 })

    const count = recordSavingsEvents(db, ledger, 'sess_a')
    expect(count).toBe(3)

    const byLever = Object.fromEntries(summarizeByLever(db, 'sess_a').map((r) => [r.lever, r.totalSaved]))
    expect(byLever).toEqual({ response_cache: 120, artifact_reuse: 50, repo_map: 300 })
  })
})

describe('persistLedger — costura única (chamadas + economia)', () => {
  it('grava chamadas de modelo no llm_call_ledger e a economia no economy_lever_ledger sem duplicar', () => {
    const db = freshDb()
    const ledger = new TokenLedger()
    ledger.record('n1', { model: 'sonnet', tokensIn: 100, tokensOut: 40 })
    ledger.record('n1', { model: 'sonnet', tokensIn: 0, tokensOut: 0, savedTokens: 80, lever: 'artifact_reuse' })
    ledger.record('n1', { model: 'sonnet', tokensIn: 0, tokensOut: 0, fromCache: true, savedTokens: 30 })

    const modelRows = persistLedger(db, ledger, { sessionId: 'sess_b', provider: 'copilot' })
    // só 1 chamada real vira linha em llm_call_ledger (entries sintéticas são puladas)
    expect(modelRows).toBe(1)
    const llmRows = db.prepare('SELECT COUNT(*) AS c FROM llm_call_ledger WHERE session_id = ?').get('sess_b') as {
      c: number
    }
    expect(llmRows.c).toBe(1)

    // economia gravada uma única vez por entry com savedTokens
    const lev = db
      .prepare('SELECT COUNT(*) AS c, COALESCE(SUM(saved),0) AS s FROM economy_lever_ledger WHERE session_id = ?')
      .get('sess_b') as { c: number; s: number }
    expect(lev.c).toBe(2)
    expect(lev.s).toBe(110)
  })
})

describe('buildRepoMap — baseline dump-all (A3)', () => {
  it('fullEstimated ≥ tokensEstimated e excede o budget quando há símbolos cortados', () => {
    const symbols = Array.from({ length: 40 }, (_, i) => ({
      id: `s${i}`,
      name: `symbol${i}`,
      file: `src/file${i}.ts`,
      startLine: i + 1,
      signature: `function symbol${i}(arg: SomeLongTypeName): Promise<Result>`,
      exported: true,
    }))
    const result = buildRepoMap({ symbols, relations: [] }, { tokenBudget: 80 })
    expect(result.included).toBeGreaterThan(0)
    expect(result.included).toBeLessThan(symbols.length) // budget cortou
    expect(result.fullEstimated).toBeGreaterThan(result.tokensEstimated)
  })
})
