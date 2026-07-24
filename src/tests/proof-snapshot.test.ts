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
import { buildProofSnapshot, formatProofSnapshot } from '../core/economy/proof-snapshot.js'

function freshStore(): SqliteStore {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('proj-proof')
  return store
}

describe('buildProofSnapshot', () => {
  it('GIVEN an empty store THEN totals.tokensSaved=0, byCommand=[], scaffoldReuse.tokensSaved=0, never null', () => {
    const store = freshStore()
    const snap = buildProofSnapshot(store)

    expect(snap.totals.tokensSaved).toBe(0)
    expect(snap.byCommand).toEqual([])
    expect(snap.scaffoldReuse.tokensSaved).toBe(0)
    expect(snap.totals.inputTokens).toBe(0)
    expect(snap.totals.outputTokens).toBe(0)
    expect(snap.totals.savingsRate).toBe(0)
    expect(snap.totals.totalCommands).toBe(0)
    expect(snap.totals.totalExecMs).toBe(0)
    expect(snap.totals.avgExecMs).toBe(0)
    expect(snap.levers).toEqual([])
  })

  it('GIVEN economy_lever_ledger with an accepted recovery THEN scaffoldReuse.tokensSaved reflects it, in tokens', () => {
    const store = freshStore()
    const db = store.getDb()
    recordLeverEvent(db, {
      sessionId: 's1',
      lever: 'rag_out_recovery',
      tokensBefore: 300,
      tokensAfter: 120,
      saved: 180,
      accepted: true,
      gateOutcome: 'accepted',
    })

    const snap = buildProofSnapshot(store)
    expect(snap.scaffoldReuse.tokensSaved).toBe(180)
    expect(snap.scaffoldReuse.recovered).toBeGreaterThanOrEqual(1)
  })

  it("GIVEN 3 llm_call_ledger rows with caller='agf next' THEN byCommand has 1 row (count=3, savingsRate 0-100)", () => {
    const store = freshStore()
    const db = store.getDb()
    for (let i = 0; i < 3; i++) {
      recordModelCall(db, {
        caller: 'agf next',
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        inputTokens: 1000,
        outputTokens: 100,
        cachedInputTokens: 200,
      })
    }

    const snap = buildProofSnapshot(store)
    expect(snap.byCommand).toHaveLength(1)
    expect(snap.byCommand[0].command).toBe('agf next')
    expect(snap.byCommand[0].count).toBe(3)
    expect(snap.byCommand[0].savingsRate).toBeGreaterThanOrEqual(0)
    expect(snap.byCommand[0].savingsRate).toBeLessThanOrEqual(100)
  })

  it('runs 100x on a 10-row in-memory store averaging <=50ms per call (pure, no filesystem I/O)', () => {
    const store = freshStore()
    const db = store.getDb()
    for (let i = 0; i < 10; i++) {
      recordModelCall(db, {
        caller: `cmd-${i % 3}`,
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        inputTokens: 500,
        outputTokens: 100,
        cachedInputTokens: 50,
      })
    }

    const start = performance.now()
    for (let i = 0; i < 100; i++) buildProofSnapshot(store)
    const elapsed = performance.now() - start

    expect(elapsed / 100).toBeLessThanOrEqual(50)
  })

  it('carries baselineExtrapolated when the delegate economy extrapolated its baseline', () => {
    const store = freshStore()
    const snap = buildProofSnapshot(store)
    // Empty store: no delegate economy yet -> baselineExtrapolated defaults false, never undefined.
    expect(typeof snap.totals.baselineExtrapolated).toBe('boolean')
  })
})

describe('formatProofSnapshot', () => {
  it("GIVEN a store with 1 command and 1 lever THEN output contains 'command' and 'scaffold'", () => {
    const store = freshStore()
    const db = store.getDb()
    recordModelCall(db, {
      caller: 'agf next',
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      inputTokens: 1000,
      outputTokens: 100,
      cachedInputTokens: 200,
    })
    recordLeverEvent(db, {
      sessionId: 's1',
      lever: 'rag_out_recovery',
      tokensBefore: 300,
      tokensAfter: 120,
      saved: 180,
      accepted: true,
      gateOutcome: 'accepted',
    })

    const lines = formatProofSnapshot(buildProofSnapshot(store)).join('\n').toLowerCase()
    expect(lines).toContain('command')
    expect(lines).toContain('scaffold')
  })

  it("GIVEN an empty store THEN it doesn't crash and shows 'sem dados'", () => {
    const store = freshStore()
    const lines = formatProofSnapshot(buildProofSnapshot(store)).join('\n')
    expect(lines).toContain('sem dados')
  })
})
