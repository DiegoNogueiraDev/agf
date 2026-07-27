/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Prova de economia: valida que o baseline decompõe a fatura nos 3 termos,
 * calcula fator de redução, e a simulação cross-provider mostra o spread.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { recordModelCall, persistLedger } from '../core/observability/llm-call-ledger.js'
import { recordLeverEvent } from '../core/economy/economy-lever-ledger.js'
import { summarizeBaseline, formatBaseline, simulateProviders, formatSimulate } from '../core/observability/baseline.js'
import { TokenLedger } from '../core/autonomy/token-ledger.js'

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

describe('F5 — Prova de economia: baseline decompõe fatura', () => {
  it('summarizeBaseline retorna hasData=false para ledger vazio', () => {
    const db = freshDb()
    const r = summarizeBaseline(db)
    expect(r.hasData).toBe(false)
    expect(r.actualUsd).toBe(0)
    db.close()
  })

  it('decompõe fatura real nos 3 termos com input > cache > output', () => {
    const db = freshDb()
    const ledger = new TokenLedger()
    ledger.recordCall('n1', {
      model: 'claude-sonnet-4.6',
      prompt: 'x'.repeat(2000),
      response: 'y'.repeat(500),
      reportedIn: 500,
      reportedOut: 125,
    })
    persistLedger(db, ledger, { sessionId: 'prova-1', provider: 'copilot' })
    const r = summarizeBaseline(db)
    expect(r.hasData).toBe(true)
    expect(r.priced).toBe(true)
    expect(r.tokensIn).toBeGreaterThan(0)
    expect(r.tokensOut).toBeGreaterThan(0)
    expect(r.inputFull.share).toBeGreaterThan(0)
    expect(r.cachePaid.share).toBeGreaterThanOrEqual(0)
    expect(r.output.share).toBeGreaterThan(0)
    expect(r.actualUsd).toBeGreaterThan(0)
    expect(r.fator).toBeGreaterThanOrEqual(1)
    db.close()
  })

  it('fator de redução > 1 quando há levers de economia', () => {
    const db = freshDb()
    const ledger = new TokenLedger()
    ledger.recordCall('n1', {
      model: 'claude-sonnet-4.6',
      prompt: 'x'.repeat(2000),
      response: 'y'.repeat(500),
      reportedIn: 500,
      reportedOut: 125,
    })
    persistLedger(db, ledger, { sessionId: 'prova-2', provider: 'copilot' })
    recordLeverEvent(db, {
      sessionId: 'prova-2',
      lever: 'compress',
      tokensBefore: 1000,
      tokensAfter: 300,
      saved: 700,
      accepted: true,
      gateOutcome: 'accepted',
    })
    const r = summarizeBaseline(db)
    expect(r.leverSavedTokens).toBe(700)
    expect(r.fator).toBeGreaterThan(1)
    expect(r.economiaPct).toBeGreaterThan(0)
    db.close()
  })

  it('veredito §6 é informado (output domina ou input domina)', () => {
    const db = freshDb()
    recordModelCall(db, {
      sessionId: 'v1',
      model: 'claude-sonnet-4.6',
      provider: 'copilot',
      inputTokens: 10000,
      outputTokens: 100,
    })
    const r = summarizeBaseline(db, { sessionId: 'v1' })
    expect(r.verdict).toBeTruthy()
    expect(r.verdict.length).toBeGreaterThan(10)
    if (r.inputShare > 0.6) expect(r.verdict).toMatch(/Input|input|contexto/)
    db.close()
  })
})

describe('F5 — metrics --simulate cross-provider', () => {
  it('simulateProviders re-precifica sob todos os modelos', () => {
    const r = simulateProviders(1000, 200, 500)
    expect(r.rows.length).toBeGreaterThan(2)
    expect(r.tokensIn).toBe(1000)
    expect(r.tokensOut).toBe(500)
    expect(r.spread).toBeGreaterThan(0)
  })

  it('formatSimulate mostra tabela legível', () => {
    const r = simulateProviders(1000, 200, 500)
    const lines = formatSimulate(r)
    const output = lines.join('\n')
    expect(output).toMatch(/Simulação cross-provider/)
    expect(output).toMatch(/modelo/)
    expect(output).toMatch(/custo/)
  })
})

describe('F5 — formatBaseline output', () => {
  it('exibe fator de redução e veredito', () => {
    const db = freshDb()
    recordModelCall(db, {
      sessionId: 'fmt-1',
      model: 'claude-sonnet-4.6',
      provider: 'copilot',
      inputTokens: 5000,
      outputTokens: 2000,
      cachedInputTokens: 1000,
    })
    recordLeverEvent(db, {
      sessionId: 'fmt-1',
      lever: 'compress',
      tokensBefore: 2000,
      tokensAfter: 500,
      saved: 1500,
      accepted: true,
      gateOutcome: 'accepted',
    })
    const r = summarizeBaseline(db, { sessionId: 'fmt-1' })
    const lines = formatBaseline(r)
    const output = lines.join('\n')
    expect(output).toMatch(/Baseline da fatura/)
    expect(output).toMatch(/fator/)
    expect(output).toMatch(/Veredito/)
    expect(r.fator).toBeGreaterThan(1)
    db.close()
  })
})
