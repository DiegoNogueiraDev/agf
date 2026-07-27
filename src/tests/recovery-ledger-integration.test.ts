/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * T3: Persisted Recovery Ledger — integração RecoveryRecipeEngine + SQLite
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RecoveryLedger } from '../core/schemas/recovery-ledger.schema.js'
import { RecoveryRecipeEngine, type FailureSignal } from '../core/autonomy/recovery-recipes.js'

describe('RecoveryRecipeEngine + RecoveryLedger', () => {
  let ledger: RecoveryLedger
  let engine: RecoveryRecipeEngine
  let dbPath: string

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'recovery-int-'))
    dbPath = join(dir, 'recovery.db')
    ledger = new RecoveryLedger(dbPath)
    engine = new RecoveryRecipeEngine(ledger)
  })

  afterEach(() => {
    engine.reset()
    ledger.close()
    rmSync(dbPath, { recursive: true, force: true })
  })

  it('persists attempts to SQLite via recordAttempt', () => {
    const signal: FailureSignal = { kind: 'llm_timeout', message: 'Request timed out' }
    const recipe = engine.diagnose(signal)
    engine.recordAttempt(recipe, signal)

    const attempts = ledger.list({ errorKind: 'llm_timeout' })
    expect(attempts).toHaveLength(1)
    expect(attempts[0]?.operation).toBe('gateway.generate')
  })

  it('tracks retry count across engine restarts', () => {
    const signal: FailureSignal = { kind: 'llm_timeout', message: 'Timeout' }
    const recipe = engine.diagnose(signal)

    engine.recordAttempt(recipe, signal)
    engine.recordAttempt(recipe, signal)

    const engine2 = new RecoveryRecipeEngine(ledger)
    const outcome = engine2.recordAttempt(recipe, signal)
    expect(outcome.attemptsMade).toBe(3)
  })

  it('triggers escalation after max retries', () => {
    const signal: FailureSignal = { kind: 'llm_timeout', message: 'Timeout' }
    const recipe = engine.diagnose(signal)

    for (let i = 0; i < recipe.maxRetries; i++) {
      const outcome = engine.recordAttempt(recipe, signal)
      expect(outcome.shouldRetry).toBe(true)
    }

    const final = engine.recordAttempt(recipe, signal)
    expect(final.shouldRetry).toBe(false)
    expect(final.attemptsMade).toBe(recipe.maxRetries + 1)
  })

  it('resets attempt tracking per failure kind', () => {
    const signal: FailureSignal = { kind: 'llm_timeout', message: 't1' }
    const recipe = engine.diagnose(signal)
    engine.recordAttempt(recipe, signal)

    ledger.reset('llm_timeout')
    engine.reset('llm_timeout')

    const outcome = engine.recordAttempt(recipe, signal)
    expect(outcome.attemptsMade).toBe(1)
  })

  it('records escalation reason when not retrying', () => {
    const signal: FailureSignal = { kind: 'llm_auth_error', message: 'Invalid key' }
    const recipe = engine.diagnose(signal)

    const outcome = engine.recordAttempt(recipe, signal)
    expect(outcome.shouldRetry).toBe(false)
    expect(outcome.escalation).toBe('AlertHuman')

    const attempts = ledger.list({ errorKind: 'llm_auth_error' })
    expect(attempts).toHaveLength(1)
    expect(attempts[0]?.retryable).toBe(false)
  })
})
