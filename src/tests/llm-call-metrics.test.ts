import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { recordModelCall, summarizeLedger } from '../core/observability/llm-call-ledger.js'

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

function seed(db: Database.Database): void {
  // IDs reais do pool — casam por prefixo com MODEL_PRICING (claude-sonnet-4 etc.)
  // sessão s1: node_1 (2 chamadas), node_2 (1 chamada)
  recordModelCall(db, {
    sessionId: 's1',
    nodeId: 'node_1',
    model: 'claude-sonnet-4.6',
    provider: 'copilot',
    inputTokens: 100,
    outputTokens: 40,
  })
  recordModelCall(db, {
    sessionId: 's1',
    nodeId: 'node_1',
    model: 'claude-sonnet-4.6',
    provider: 'copilot',
    inputTokens: 30,
    outputTokens: 10,
  })
  recordModelCall(db, {
    sessionId: 's1',
    nodeId: 'node_2',
    model: 'claude-haiku-4.5',
    provider: 'copilot',
    inputTokens: 20,
    outputTokens: 5,
  })
  // sessão s2: node_3
  recordModelCall(db, {
    sessionId: 's2',
    nodeId: 'node_3',
    model: 'claude-opus-4.6',
    provider: 'copilot',
    inputTokens: 200,
    outputTokens: 80,
  })
}

describe('summarizeLedger — métricas agregadas do llm_call_ledger', () => {
  it('totais globais somam todas as linhas', () => {
    const db = freshDb()
    seed(db)
    const m = summarizeLedger(db)
    expect(m.totals.calls).toBe(4)
    expect(m.totals.tokensIn).toBe(350)
    expect(m.totals.tokensOut).toBe(135)
    expect(m.totals.total).toBe(485)
    db.close()
  })

  it('tokens/task: uma linha por node, ordenada por total desc', () => {
    const db = freshDb()
    seed(db)
    const m = summarizeLedger(db)
    expect(m.byTask[0].nodeId).toBe('node_3') // 280, maior
    const n1 = m.byTask.find((t) => t.nodeId === 'node_1')!
    expect(n1.calls).toBe(2)
    expect(n1.total).toBe(180)
    db.close()
  })

  it('tokens/sessão: agrega por session_id', () => {
    const db = freshDb()
    seed(db)
    const m = summarizeLedger(db)
    const s1 = m.bySession.find((s) => s.sessionId === 's1')!
    expect(s1.calls).toBe(3)
    expect(s1.total).toBe(205)
    db.close()
  })

  it('filtro por sessão restringe o resumo', () => {
    const db = freshDb()
    seed(db)
    const m = summarizeLedger(db, { sessionId: 's2' })
    expect(m.totals.calls).toBe(1)
    expect(m.byTask).toHaveLength(1)
    expect(m.byTask[0].nodeId).toBe('node_3')
    db.close()
  })

  it('média tokens/task concluída', () => {
    const db = freshDb()
    seed(db)
    const m = summarizeLedger(db)
    // 485 tokens / 3 tasks distintas
    expect(m.avgTokensPerTask).toBe(Math.round(485 / 3))
    db.close()
  })

  it('DB vazio retorna zeros sem quebrar', () => {
    const db = freshDb()
    const m = summarizeLedger(db)
    expect(m.totals.total).toBe(0)
    expect(m.byTask).toEqual([])
    expect(m.avgTokensPerTask).toBe(0)
    expect(m.totals.costUsd).toBe(0)
    db.close()
  })

  it('custo USD: agrega cost_usd nos totais, por task e por sessão', () => {
    const db = freshDb()
    seed(db)
    const m = summarizeLedger(db)
    // sonnet-4.6 (node_1) e opus-4.6 (node_3) têm preço; haiku-4.5 (node_2) também.
    expect(m.totals.costUsd).toBeGreaterThan(0)
    const n3 = m.byTask.find((t) => t.nodeId === 'node_3')!
    expect(n3.costUsd).toBeGreaterThan(0) // opus é o mais caro
    const s1 = m.bySession.find((s) => s.sessionId === 's1')!
    expect(s1.costUsd).toBeGreaterThan(0)
    // soma das tasks = total
    const taskSum = m.byTask.reduce((acc, t) => acc + t.costUsd, 0)
    expect(taskSum).toBeCloseTo(m.totals.costUsd, 8)
    db.close()
  })
})
