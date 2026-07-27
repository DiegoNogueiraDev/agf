/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { recordModelCall } from '../core/observability/llm-call-ledger.js'
import { recordLeverEvent } from '../core/economy/economy-lever-ledger.js'
import { buildEconomySnapshot } from '../core/web/economy-snapshot.js'

function freshStore(): SqliteStore {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('proj-economy')
  return store
}

describe('buildEconomySnapshot', () => {
  it('returns zeroed totals and empty levers for an empty store (never null)', () => {
    const store = freshStore()
    const snap = buildEconomySnapshot(store)

    expect(snap.totals).toEqual({ tokensIn: 0, tokensOut: 0, cache: 0, saved: 0, savedUsd: 0, costUsd: 0 })
    expect(snap.levers).toEqual([])
    expect(typeof snap.savingsRate).toBe('number')
  })

  it('aggregates ledger totals and per-lever savings into the snapshot shape', () => {
    const store = freshStore()
    const db = store.getDb()

    recordModelCall(db, {
      provider: 'anthropic',
      model: 'claude-opus-4-8',
      inputTokens: 1000,
      outputTokens: 200,
      cachedInputTokens: 300,
      costUsd: 0.5,
    })
    recordLeverEvent(db, {
      sessionId: 's1',
      lever: 'ncd_dedup',
      tokensBefore: 500,
      tokensAfter: 100,
      saved: 400,
      accepted: true,
      gateOutcome: 'accepted',
    })

    const snap = buildEconomySnapshot(store)

    expect(snap.totals.tokensIn).toBe(1000)
    expect(snap.totals.tokensOut).toBe(200)
    expect(snap.totals.cache).toBe(300)
    expect(snap.totals.costUsd).toBeCloseTo(0.5)

    const dedup = snap.levers.find((l) => l.lever === 'ncd_dedup')
    expect(dedup?.totalSaved).toBe(400)
    expect(dedup?.count).toBe(1)
  })

  it('includes byCommand and scaffoldReuse (reused from buildProofSnapshot, no duplicate logic)', () => {
    const store = freshStore()
    const db = store.getDb()

    recordModelCall(db, {
      provider: 'anthropic',
      model: 'claude-opus-4-8',
      inputTokens: 1000,
      outputTokens: 200,
      cachedInputTokens: 300,
      costUsd: 0.5,
      caller: 'next',
    })

    const snap = buildEconomySnapshot(store)

    expect(Array.isArray(snap.byCommand)).toBe(true)
    expect(snap.byCommand.some((r) => r.command === 'next')).toBe(true)
    expect(snap.scaffoldReuse).toEqual({ recovered: 0, generated: 0, tokensSaved: 0, savingsRatio: 0 })
  })
})
