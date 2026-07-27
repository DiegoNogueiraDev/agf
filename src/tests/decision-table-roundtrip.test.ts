/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_8ce31f20010e — decision-table compiled-reasoning cache (zero-token)
 *
 * Integration: observe → compile → fast-path hit (0 LLM).
 *
 * AC1: Given a learned workflow, When it runs, Then decision-table resolves
 *      without calling the LLM (0 tokens) and records the hit.
 * AC2: Given an unlearned state, When it runs, Then falls back to LLM (fallback)
 *      and the entry can be compiled for future runs.
 */

import { describe, it, expect, vi } from 'vitest'
import Database from 'better-sqlite3'
import { DecisionTableStore } from '../core/learning/decision-table-store.js'
import { compileDecisions } from '../core/learning/learning-compiler.js'
import { resolveDecision } from '../core/learning/decision-fast-path.js'
import { decisionKey, type DecisionContext, type DecisionObservation } from '../core/learning/decision-key.js'

const NOW = 1_700_000_000_000

const ctx: DecisionContext = {
  domain: 'agf/routing',
  phase: 'BUILD',
  role: 'tier-router',
  input: 'pick cheap model for lint task',
}

function obs(key: string, decision: unknown, success: boolean): DecisionObservation {
  return { key, context: ctx, decision, success, ts: NOW }
}

// ── AC1 — learned workflow bate na tabela, 0 token LLM ────────────────────────

describe('decision-table round-trip (AC1 — learned workflow, 0 LLM)', () => {
  it('resolves from table after compile — fallback never called', () => {
    const db = new Database(':memory:')
    const store = new DecisionTableStore(db)
    const key = decisionKey(ctx)

    // Step 1: observe 2 successes (gate: minOccurrences=2, minSuccessRate=0.7)
    const observations: DecisionObservation[] = [obs(key, { model: 'haiku' }, true), obs(key, { model: 'haiku' }, true)]
    const compiled = compileDecisions(observations, store, { now: NOW })
    expect(compiled.compiled).toBe(1)
    expect(compiled.emittedKeys).toContain(key)

    // Step 2: next run — fast-path resolves, fallback not called
    const fallback = vi.fn(() => ({ model: 'opus' }))
    const result = resolveDecision(ctx, store, fallback, { now: NOW })

    expect(result.fromFastPath).toBe(true)
    expect(result.decision).toMatchObject({ model: 'haiku' })
    expect(fallback).not.toHaveBeenCalled()
  })

  it('records the hit (last_used_at bumped)', () => {
    const db = new Database(':memory:')
    const store = new DecisionTableStore(db)
    const key = decisionKey(ctx)

    compileDecisions([obs(key, { model: 'haiku' }, true), obs(key, { model: 'haiku' }, true)], store, { now: NOW })

    resolveDecision(ctx, store, () => null, { now: NOW + 5000 })
    const row = store.get(key)
    expect(row?.lastUsedAt).toBe(NOW + 5000)
  })
})

// ── AC2 — unlearned state: LLM called, entry compilable ──────────────────────

describe('decision-table round-trip (AC2 — unlearned, fallback + can compile)', () => {
  it('calls fallback on first run (no rule compiled yet)', () => {
    const db = new Database(':memory:')
    const store = new DecisionTableStore(db)
    const fallback = vi.fn(() => ({ model: 'opus' }))

    const result = resolveDecision(ctx, store, fallback, { now: NOW })

    expect(result.fromFastPath).toBe(false)
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('can compile an entry after 2 observed successes', () => {
    const db = new Database(':memory:')
    const store = new DecisionTableStore(db)
    const key = decisionKey(ctx)

    // First runs → miss (no rule yet)
    resolveDecision(ctx, store, () => ({ model: 'opus' }), { now: NOW })
    resolveDecision(ctx, store, () => ({ model: 'opus' }), { now: NOW })

    // Compile from the 2 successes
    const result = compileDecisions([obs(key, { model: 'opus' }, true), obs(key, { model: 'opus' }, true)], store, {
      now: NOW,
    })
    expect(result.compiled).toBe(1)
    expect(store.get(key)).not.toBeNull()
  })

  it('subsequent run hits the table after compile', () => {
    const db = new Database(':memory:')
    const store = new DecisionTableStore(db)
    const key = decisionKey(ctx)

    // Miss (no rule yet)
    const firstResult = resolveDecision(ctx, store, () => ({ model: 'opus' }), { now: NOW })
    expect(firstResult.fromFastPath).toBe(false)

    // Observe + compile
    compileDecisions([obs(key, { model: 'opus' }, true), obs(key, { model: 'opus' }, true)], store, { now: NOW })

    // Hit (rule now compiled)
    const secondFallback = vi.fn(() => ({ model: 'opus' }))
    const secondResult = resolveDecision(ctx, store, secondFallback, { now: NOW + 1000 })
    expect(secondResult.fromFastPath).toBe(true)
    expect(secondFallback).not.toHaveBeenCalled()
  })
})
