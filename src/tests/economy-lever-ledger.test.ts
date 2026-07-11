/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations, configureDb } from '../core/store/migrations.js'
import {
  recordLeverEvent,
  summarizeByLever,
  recordCacheHitEvents,
  summarizeScaffoldRecovery,
} from '../core/economy/economy-lever-ledger.js'
import type { LeverEvent } from '../core/economy/economy-lever-ledger.js'
import { TokenLedger } from '../core/autonomy/token-ledger.js'

let db: Database.Database

beforeAll(() => {
  db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
})

afterAll(() => {
  db.close()
})

describe('recordLeverEvent', () => {
  it('insere linha com todos os campos', () => {
    const event: LeverEvent = {
      sessionId: 'session-1',
      nodeId: 'node-abc',
      lever: 'compress',
      tokensBefore: 1000,
      tokensAfter: 300,
      saved: 700,
      accepted: true,
      gateOutcome: 'accepted',
    }
    const id = recordLeverEvent(db, event)
    expect(id).toBeTruthy()
    expect(typeof id).toBe('string')

    const row = db.prepare('SELECT * FROM economy_lever_ledger WHERE id = ?').get(id) as Record<string, unknown>
    expect(row.lever).toBe('compress')
    expect(row.tokens_before).toBe(1000)
    expect(row.tokens_after).toBe(300)
    expect(row.saved).toBe(700)
    expect(row.accepted).toBe(1)
    expect(row.gate_outcome).toBe('accepted')
    expect(row.session_id).toBe('session-1')
    expect(row.node_id).toBe('node-abc')
  })

  it('nodeId é opcional', () => {
    const event: LeverEvent = {
      sessionId: 'session-2',
      lever: 'caveman',
      tokensBefore: 500,
      tokensAfter: 200,
      saved: 300,
      accepted: false,
      gateOutcome: 'reverted',
    }
    const id = recordLeverEvent(db, event)
    const row = db.prepare('SELECT * FROM economy_lever_ledger WHERE id = ?').get(id) as Record<string, unknown>
    expect(row.node_id).toBeNull()
  })

  it('registra ts como epoch ms', () => {
    const now = Date.now()
    const event: LeverEvent = {
      sessionId: 'session-3',
      lever: 'test',
      tokensBefore: 100,
      tokensAfter: 50,
      saved: 50,
      accepted: true,
      gateOutcome: 'accepted',
    }
    recordLeverEvent(db, event)

    const row = db.prepare('SELECT * FROM economy_lever_ledger WHERE session_id = ?').get('session-3') as Record<
      string,
      unknown
    >
    expect(Number(row.ts)).toBeGreaterThanOrEqual(now)
    expect(Number(row.ts)).toBeLessThanOrEqual(Date.now())
  })
})

describe('summarizeByLever', () => {
  beforeAll(() => {
    const events: LeverEvent[] = [
      {
        sessionId: 'sum-session',
        lever: 'compress',
        tokensBefore: 1000,
        tokensAfter: 300,
        saved: 700,
        accepted: true,
        gateOutcome: 'accepted',
      },
      {
        sessionId: 'sum-session',
        lever: 'compress',
        tokensBefore: 500,
        tokensAfter: 200,
        saved: 300,
        accepted: true,
        gateOutcome: 'accepted',
      },
      {
        sessionId: 'sum-session',
        lever: 'caveman',
        tokensBefore: 400,
        tokensAfter: 100,
        saved: 300,
        accepted: false,
        gateOutcome: 'reverted',
      },
      {
        sessionId: 'other-session',
        lever: 'compress',
        tokensBefore: 200,
        tokensAfter: 100,
        saved: 100,
        accepted: true,
        gateOutcome: 'accepted',
      },
    ]
    for (const e of events) recordLeverEvent(db, e)
  })

  it('sumariza saved por lever filtrando por session', () => {
    const summary = summarizeByLever(db, 'sum-session')
    expect(summary.length).toBe(2)

    const compress = summary.find((s) => s.lever === 'compress')
    expect(compress).toBeDefined()
    expect(compress!.totalSaved).toBe(1000)
    expect(compress!.count).toBe(2)

    const caveman = summary.find((s) => s.lever === 'caveman')
    expect(caveman).toBeDefined()
    expect(caveman!.totalSaved).toBe(300)
    expect(caveman!.count).toBe(1)
  })

  it('recordCacheHitEvents grava response_cache no economy_lever_ledger', () => {
    const ledger = new TokenLedger()
    ledger.recordCall('n1', {
      model: 'm',
      prompt: 'p',
      response: 'r',
      reportedIn: 80,
      reportedOut: 20,
      fromCache: true,
    })
    ledger.recordCall('n2', {
      model: 'm',
      prompt: 'hello',
      response: 'world',
      reportedIn: 10,
      reportedOut: 5,
      fromCache: true,
    })
    const count = recordCacheHitEvents(db, ledger, 'cache-session')
    expect(count).toBe(2)

    const rows = db
      .prepare(`SELECT lever, saved FROM economy_lever_ledger WHERE session_id='cache-session' ORDER BY saved DESC`)
      .all() as Array<{ lever: string; saved: number }>
    expect(rows.length).toBe(2)
    expect(rows[0].lever).toBe('response_cache')
    expect(rows[0].saved).toBe(100)
    expect(rows[1].lever).toBe('response_cache')
    expect(rows[1].saved).toBe(15)
  })

  it('recordCacheHitEvents com ledger sem cache hits grava 0', () => {
    const ledger = new TokenLedger()
    ledger.recordCall('n1', { model: 'm', prompt: 'p', response: 'r', reportedIn: 10, reportedOut: 5 })
    const count = recordCacheHitEvents(db, ledger, 'no-cache-session')
    expect(count).toBe(0)
  })

  it('vazio retorna 0 (array vazio)', () => {
    const summary = summarizeByLever(db, 'nonexistent-session')
    expect(summary).toEqual([])
  })

  it('sumariza global inclui dados de múltiplas sessions', () => {
    const summary = summarizeByLever(db)

    const caveman = summary.find((s) => s.lever === 'caveman')
    expect(caveman).toBeDefined()
    expect(caveman!.totalSaved).toBeGreaterThanOrEqual(300)

    const globalCount = summary.reduce((acc, s) => acc + s.count, 0)
    expect(globalCount).toBeGreaterThanOrEqual(4)
  })
})

describe('summarizeScaffoldRecovery', () => {
  it('returns all-zero on an empty ledger (no scaffold_recovery events)', () => {
    const empty = new Database(':memory:')
    configureDb(empty)
    runMigrations(empty)
    const result = summarizeScaffoldRecovery(empty)
    expect(result).toEqual({ recovered: 0, generated: 0, tokensSaved: 0, savingsRatio: 0 })
    empty.close()
  })

  it('counts accepted events as recovered, passthrough as generated', () => {
    const scoped = new Database(':memory:')
    configureDb(scoped)
    runMigrations(scoped)
    const events: LeverEvent[] = [
      {
        sessionId: 's1',
        lever: 'rag_out_recovery',
        tokensBefore: 1000,
        tokensAfter: 500,
        saved: 500,
        accepted: true,
        gateOutcome: 'accepted',
      },
      {
        sessionId: 's1',
        lever: 'rag_out_recovery',
        tokensBefore: 1000,
        tokensAfter: 500,
        saved: 500,
        accepted: true,
        gateOutcome: 'accepted',
      },
      {
        sessionId: 's1',
        lever: 'rag_out_recovery',
        tokensBefore: 400,
        tokensAfter: 400,
        saved: 0,
        accepted: false,
        gateOutcome: 'passthrough',
      },
      {
        sessionId: 's1',
        lever: 'compress', // different lever — must not be counted
        tokensBefore: 100,
        tokensAfter: 10,
        saved: 90,
        accepted: true,
        gateOutcome: 'accepted',
      },
    ]
    for (const e of events) recordLeverEvent(scoped, e)

    const result = summarizeScaffoldRecovery(scoped)
    expect(result.recovered).toBe(2)
    expect(result.generated).toBe(1)
    expect(result.tokensSaved).toBe(1000)
    expect(result.savingsRatio).toBeCloseTo(1000 / 2000, 5)
    scoped.close()
  })
})
