/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import Database from 'better-sqlite3'
import { DecisionTableStore } from '../core/learning/decision-table-store.js'
import { decisionKey, type DecisionContext } from '../core/learning/decision-key.js'
import { resolveDecision, recordFastPathSaving } from '../core/learning/decision-fast-path.js'
import { runMigrations } from '../core/store/migrations.js'

const NOW = 1_700_000_000_000
const ctx: DecisionContext = { domain: 'src/core/learning', phase: 'BUILD', role: 'implementer', input: 'pick model' }

function storeWithRule(): DecisionTableStore {
  const store = new DecisionTableStore(new Database(':memory:'))
  store.put({ key: decisionKey(ctx), decision: { model: 'haiku' }, successRate: 0.9, compiledAt: 1 })
  return store
}

describe('resolveDecision (zero-token fast-path)', () => {
  // AC1: GIVEN a compiled rule WHEN the same decision is requested THEN no LLM call and the stored decision is returned
  it('returns the compiled decision without invoking the fallback on a hit', () => {
    const store = storeWithRule()
    const fallback = vi.fn(() => ({ model: 'opus' }))
    const res = resolveDecision(ctx, store, fallback, { now: NOW })
    expect(res.fromFastPath).toBe(true)
    expect(res.decision).toEqual({ model: 'haiku' })
    expect(fallback).not.toHaveBeenCalled()
  })

  it('bumps last_used_at on a hit', () => {
    const store = storeWithRule()
    resolveDecision(ctx, store, () => ({ model: 'opus' }), { now: NOW })
    expect(store.get(decisionKey(ctx))?.lastUsedAt).toBe(NOW)
  })

  // AC2: GIVEN no compiled rule WHEN requested THEN the existing routing runs unchanged
  it('falls back unchanged when there is no compiled rule', () => {
    const store = new DecisionTableStore(new Database(':memory:'))
    const fallback = vi.fn(() => ({ model: 'opus' }))
    const res = resolveDecision(ctx, store, fallback, { now: NOW })
    expect(res.fromFastPath).toBe(false)
    expect(res.decision).toEqual({ model: 'opus' })
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  // AC3 (seam): a hit reports the saving via onHit
  it('reports the estimated tokens saved on a hit', () => {
    const store = storeWithRule()
    const onHit = vi.fn()
    resolveDecision(ctx, store, () => ({ model: 'opus' }), { now: NOW, estimatedTokensSaved: 1200, onHit })
    expect(onHit).toHaveBeenCalledTimes(1)
    expect(onHit.mock.calls[0][0]).toMatchObject({ key: decisionKey(ctx), estimatedTokensSaved: 1200 })
  })

  it('does not report a saving on a miss', () => {
    const store = new DecisionTableStore(new Database(':memory:'))
    const onHit = vi.fn()
    resolveDecision(ctx, store, () => ({ model: 'opus' }), { now: NOW, onHit })
    expect(onHit).not.toHaveBeenCalled()
  })
})

describe('recordFastPathSaving', () => {
  // AC3 (concrete): the saving is written to llm_call_ledger
  it('writes a zero-cost ledger row attributing the avoided tokens', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    recordFastPathSaving(db, { sessionId: 's1', key: 'k', tokensSaved: 1500, nodeId: 'node_x' })
    const row = db
      .prepare(`SELECT cost_usd, cached_input_tokens, status FROM llm_call_ledger WHERE session_id = 's1'`)
      .get() as { cost_usd: number; cached_input_tokens: number; status: string } | undefined
    expect(row).toBeDefined()
    expect(row?.cost_usd).toBe(0)
    expect(row?.cached_input_tokens).toBe(1500)
    expect(row?.status).toBe('compiled_hit')
  })
})
