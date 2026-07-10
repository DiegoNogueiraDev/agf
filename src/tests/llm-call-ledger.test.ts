import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { TokenLedger } from '../core/autonomy/token-ledger.js'
import { persistLedger, recordModelCall, summarizeLedger } from '../core/observability/llm-call-ledger.js'
import { getSessionTokensConsumed } from '../core/harness/savings-ledger.js'

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

describe('llm-call-ledger — persistência do token-ledger no SQLite', () => {
  it('recordModelCall insere uma linha consultável por getSessionTokensConsumed', () => {
    const db = freshDb()
    recordModelCall(db, {
      sessionId: 'sess_1',
      projectId: 'proj_1',
      nodeId: 'node_1',
      model: 'sonnet',
      provider: 'copilot',
      inputTokens: 100,
      outputTokens: 40,
    })
    expect(getSessionTokensConsumed(db, 'sess_1')).toBe(140)
    db.close()
  })

  it('persistLedger grava uma linha por entry e a soma bate com o ledger', () => {
    const db = freshDb()
    const ledger = new TokenLedger()
    ledger.record('a', { model: 'haiku', tokensIn: 10, tokensOut: 5 })
    ledger.record('b', { model: 'sonnet', tokensIn: 20, tokensOut: 8 })

    const count = persistLedger(db, ledger, { sessionId: 'sess_2', projectId: 'proj_1', provider: 'copilot' })
    expect(count).toBe(2)
    expect(getSessionTokensConsumed(db, 'sess_2')).toBe(ledger.totals().total)
    db.close()
  })

  it('persiste por sessão — sessões distintas não se misturam', () => {
    const db = freshDb()
    recordModelCall(db, { sessionId: 's1', model: 'm', provider: 'copilot', inputTokens: 5, outputTokens: 5 })
    recordModelCall(db, { sessionId: 's2', model: 'm', provider: 'copilot', inputTokens: 7, outputTokens: 3 })
    expect(getSessionTokensConsumed(db, 's1')).toBe(10)
    expect(getSessionTokensConsumed(db, 's2')).toBe(10)
    db.close()
  })

  it('recordModelCall calcula cost_usd a partir do modelo quando não informado', () => {
    const db = freshDb()
    recordModelCall(db, {
      sessionId: 'c1',
      model: 'claude-sonnet-4.6',
      provider: 'copilot',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    })
    const row = db.prepare(`SELECT cost_usd FROM llm_call_ledger WHERE session_id = 'c1'`).get() as { cost_usd: number }
    // sonnet-4 = $3/1M in + $15/1M out = $18 para 1M+1M
    expect(row.cost_usd).toBeCloseTo(18, 6)
    db.close()
  })

  it('recordModelCall respeita cost_usd explícito quando informado', () => {
    const db = freshDb()
    recordModelCall(db, {
      sessionId: 'c2',
      model: 'claude-sonnet-4.6',
      provider: 'copilot',
      inputTokens: 100,
      outputTokens: 40,
      costUsd: 0.99,
    })
    const row = db.prepare(`SELECT cost_usd FROM llm_call_ledger WHERE session_id = 'c2'`).get() as { cost_usd: number }
    expect(row.cost_usd).toBe(0.99)
    db.close()
  })

  it('persiste e agrega reasoning_tokens (Frente C — T_reason)', () => {
    const db = freshDb()
    const ledger = new TokenLedger()
    ledger.recordCall('n1', {
      model: 'deepseek/deepseek-r1',
      prompt: 'p',
      response: 'r',
      reportedIn: 10,
      reportedOut: 50,
      reportedReasoning: 35,
    })
    persistLedger(db, ledger, { sessionId: 'rc1', provider: 'openrouter' })
    const summary = summarizeLedger(db, { sessionId: 'rc1' })
    expect(summary.totals.reasoningTokens).toBe(35)
    expect(summary.totals.tokensOut).toBe(50)
    db.close()
  })

  it('ausência de reasoning agrega 0 (não-regressão)', () => {
    const db = freshDb()
    recordModelCall(db, { sessionId: 'rc0', model: 'm', provider: 'copilot', inputTokens: 5, outputTokens: 5 })
    expect(summarizeLedger(db, { sessionId: 'rc0' }).totals.reasoningTokens).toBe(0)
    db.close()
  })

  it('cache hit (fromCache) não vira spend, mas a economia é gravada no economy_lever_ledger (A2)', () => {
    const db = freshDb()
    const ledger = new TokenLedger()
    ledger.recordCall('n1', {
      model: 'm',
      prompt: 'p',
      response: 'r',
      reportedIn: 80,
      reportedOut: 20,
      fromCache: true,
    })
    persistLedger(db, ledger, { sessionId: 'cz', provider: 'openrouter' })

    // NÃO entrou no llm_call_ledger (sem spend):
    expect(getSessionTokensConsumed(db, 'cz')).toBe(0)
    expect(summarizeLedger(db, { sessionId: 'cz' }).totals.calls).toBe(0)
    // A2: a costura única grava a economia (uma vez) como response_cache:
    const row = db
      .prepare(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(saved),0) AS s FROM economy_lever_ledger WHERE session_id='cz' AND lever='response_cache'`,
      )
      .get() as { cnt: number; s: number }
    expect(row.cnt).toBe(1)
    expect(row.s).toBe(100)
    db.close()
  })

  it('ledger vazio persiste zero linhas', () => {
    const db = freshDb()
    const count = persistLedger(db, new TokenLedger(), { sessionId: 's3', provider: 'copilot' })
    expect(count).toBe(0)
    expect(getSessionTokensConsumed(db, 's3')).toBe(0)
    db.close()
  })
})
