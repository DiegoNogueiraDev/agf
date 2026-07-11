/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations, configureDb } from '../core/store/migrations.js'
import { recordLeverEvent } from '../core/economy/economy-lever-ledger.js'
import type { LeverEvent } from '../core/economy/economy-lever-ledger.js'
import { formatEconomyReport } from '../core/economy/economy-lever-ledger.js'

describe('formatEconomyReport', () => {
  it('retorna relatório vazio quando não há levers', () => {
    const db = new Database(':memory:')
    configureDb(db)
    runMigrations(db)
    const report = formatEconomyReport(db)
    expect(report).toContain('Nenhum')
    db.close()
  })

  it('mostra tabela com lever, saved, accepted, reverted, ccr_dropped', () => {
    const db = new Database(':memory:')
    configureDb(db)
    runMigrations(db)

    const events: LeverEvent[] = [
      {
        sessionId: 's1',
        lever: 'compress',
        tokensBefore: 1000,
        tokensAfter: 300,
        saved: 700,
        accepted: true,
        gateOutcome: 'accepted',
      },
      {
        sessionId: 's1',
        lever: 'compress',
        tokensBefore: 500,
        tokensAfter: 200,
        saved: 300,
        accepted: true,
        gateOutcome: 'accepted',
      },
      {
        sessionId: 's1',
        lever: 'caveman',
        tokensBefore: 400,
        tokensAfter: 100,
        saved: 300,
        accepted: false,
        gateOutcome: 'reverted',
      },
      {
        sessionId: 's1',
        lever: 'caveman',
        tokensBefore: 300,
        tokensAfter: 100,
        saved: 200,
        accepted: true,
        gateOutcome: 'accepted',
      },
      {
        sessionId: 's1',
        lever: 'cache-aligner',
        tokensBefore: 200,
        tokensAfter: 200,
        saved: 0,
        accepted: false,
        gateOutcome: 'ccr_dropped',
      },
    ]
    for (const e of events) recordLeverEvent(db, e)

    const report = formatEconomyReport(db)
    expect(report).toContain('compress')
    expect(report).toContain('1000') // total saved for compress
    expect(report).toContain('caveman')
    expect(report).toContain('500') // total saved for caveman (300+200)
    expect(report).toContain('Rev')
    expect(report).toContain('CCR')
    expect(report).toContain('Accept')
    expect(report).toMatch(/\d+%/) // acceptance rate
    db.close()
  })

  it('mostra — para lever sem accepted+reverted', () => {
    const db = new Database(':memory:')
    configureDb(db)
    runMigrations(db)

    const events: LeverEvent[] = [
      {
        sessionId: 's1',
        lever: 'aligner',
        tokensBefore: 100,
        tokensAfter: 100,
        saved: 0,
        accepted: false,
        gateOutcome: 'ccr_dropped',
      },
      {
        sessionId: 's1',
        lever: 'aligner',
        tokensBefore: 200,
        tokensAfter: 200,
        saved: 0,
        accepted: false,
        gateOutcome: 'passthrough',
      },
    ]
    for (const e of events) recordLeverEvent(db, e)

    const report = formatEconomyReport(db)
    expect(report).toContain('—')
    db.close()
  })
})
