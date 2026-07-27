/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Task 0.2 — agf submit Captura pilot_tokens (Pilot Usage Reporting)
 *
 * AC:
 * 1. usage field in result JSON is accepted and passed through
 * 2. campo usage ausente → comportamento atual preservado (sem erro)
 * 3. agf savings mostra bloco "Pilot Economy" separado quando pilot_tokens > 0
 * 4. agf submit --help mostra exemplo com campo usage
 */
import { describe, it, expect } from 'vitest'
import { parseExecutorResult, type ExecutorResult, type PilotUsage } from '../core/context/executor-brief.js'
import { recordPilotCall, summarizePilotLedger } from '../core/observability/pilot-ledger.js'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations.js'

describe('ExecutorResult — campo usage (AC#1 + AC#2)', () => {
  it('parseia resultado sem usage (backward compat, AC#2)', () => {
    const raw = '{"arquivos":["a.ts"],"testes":{"passed":5,"failed":0},"desvios":[]}'
    const result = parseExecutorResult(raw)
    expect(result).not.toBeNull()
    expect(result?.usage).toBeUndefined()
  })

  it('parseia resultado com usage completo (AC#1)', () => {
    const raw = JSON.stringify({
      arquivos: ['a.ts'],
      testes: { passed: 5, failed: 0 },
      desvios: [],
      usage: { tokens_in: 1200, tokens_out: 800, model: 'claude-haiku-4-5' },
    })
    const result = parseExecutorResult(raw)
    expect(result).not.toBeNull()
    expect(result?.usage).toEqual({ tokens_in: 1200, tokens_out: 800, model: 'claude-haiku-4-5' })
  })

  it('PilotUsage tipo existe e é tipado corretamente', () => {
    const u: PilotUsage = { tokens_in: 100, tokens_out: 50, model: 'claude-sonnet-4-6' }
    expect(u.tokens_in).toBe(100)
    expect(u.model).toBe('claude-sonnet-4-6')
  })
})

describe('recordPilotCall + summarizePilotLedger (AC#3)', () => {
  function makeDb(): Database.Database {
    const db = new Database(':memory:')
    runMigrations(db)
    return db
  }

  it('grava pilot call com caller=pilot e modelo', () => {
    const db = makeDb()
    recordPilotCall(db, {
      nodeId: 'node_abc',
      tokensIn: 1200,
      tokensOut: 800,
      model: 'claude-haiku-4-5',
      sessionId: 'test-session',
    })
    const summary = summarizePilotLedger(db)
    expect(summary.total).toBeGreaterThan(0)
    expect(summary.tokensIn).toBe(1200)
    expect(summary.tokensOut).toBe(800)
  })

  it('summarizePilotLedger retorna zero quando nenhum pilot call', () => {
    const db = makeDb()
    const summary = summarizePilotLedger(db)
    expect(summary.total).toBe(0)
    expect(summary.tokensIn).toBe(0)
    expect(summary.tokensOut).toBe(0)
  })

  it('pilot calls são separados de LLM calls (caller = pilot)', () => {
    const db = makeDb()
    recordPilotCall(db, {
      nodeId: 'node_x',
      tokensIn: 500,
      tokensOut: 200,
      model: 'claude-sonnet-4-6',
      sessionId: 'test',
    })
    // Verificar diretamente que caller = 'pilot' foi gravado
    const row = db.prepare(`SELECT caller FROM llm_call_ledger WHERE caller = 'pilot' LIMIT 1`).get() as
      { caller: string } | undefined
    expect(row?.caller).toBe('pilot')
  })
})
