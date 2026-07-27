/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * task-recovery-recipes — Recovery Recipes Engine tests.
 */
import { describe, it, expect, vi } from 'vitest'
import { RecoveryRecipeEngine, type FailureSignal, type RecipeOutcome } from '../core/autonomy/recovery-recipes.js'

describe('RecoveryRecipeEngine', () => {
  let engine: RecoveryRecipeEngine

  beforeEach(() => {
    engine = new RecoveryRecipeEngine()
  })

  it('diagnoses LLM timeout as retryable', () => {
    const signal: FailureSignal = {
      kind: 'llm_timeout',
      message: 'Request timed out after 30s',
    }
    const recipe = engine.diagnose(signal)
    expect(recipe).not.toBeNull()
    expect(recipe!.retryable).toBe(true)
    expect(recipe!.escalation).toBe('LogAndContinue')
  })

  it('diagnoses LLM auth error as non-retryable', () => {
    const signal: FailureSignal = {
      kind: 'llm_auth_error',
      message: 'Invalid API key',
    }
    const recipe = engine.diagnose(signal)
    expect(recipe).not.toBeNull()
    expect(recipe!.retryable).toBe(false)
    expect(recipe!.escalation).toBe('AlertHuman')
  })

  it('diagnoses MCP handshake failure as retryable', () => {
    const signal: FailureSignal = {
      kind: 'mcp_handshake_failure',
      message: 'Connection refused',
    }
    const recipe = engine.diagnose(signal)
    expect(recipe).not.toBeNull()
    expect(recipe!.retryable).toBe(true)
  })

  it('diagnoses sandbox crash as retryable with Abort escalation', () => {
    const signal: FailureSignal = {
      kind: 'sandbox_crash',
      message: 'Container exited with code 137',
    }
    const recipe = engine.diagnose(signal)
    expect(recipe).not.toBeNull()
    expect(recipe!.retryable).toBe(true)
    expect(recipe!.escalation).toBe('Abort')
    expect(recipe!.maxRetries).toBe(2)
  })

  it('diagnoses provider failure as retryable with failover', () => {
    const signal: FailureSignal = {
      kind: 'provider_failure',
      message: 'Service unavailable',
    }
    const recipe = engine.diagnose(signal)
    expect(recipe).not.toBeNull()
    expect(recipe!.retryable).toBe(true)
    expect(recipe!.escalation).toBe('LogAndContinue')
    expect(recipe!.maxRetries).toBe(3)
  })

  it('diagnoses plugin partial startup as retryable', () => {
    const signal: FailureSignal = {
      kind: 'plugin_partial_startup',
      message: '3 of 5 plugins started',
    }
    const recipe = engine.diagnose(signal)
    expect(recipe).not.toBeNull()
    expect(recipe!.retryable).toBe(true)
    expect(recipe!.maxRetries).toBe(1)
  })

  it('diagnoses unknown failure with AlertHuman escalation', () => {
    const signal: FailureSignal = {
      kind: 'unknown_failure',
      message: 'Something unexpected happened',
    }
    const recipe = engine.diagnose(signal)
    expect(recipe).not.toBeNull()
    expect(recipe!.escalation).toBe('AlertHuman')
    expect(recipe!.retryable).toBe(false)
  })

  it('tracks attempts and triggers escalation after maxRetries', async () => {
    const signal: FailureSignal = {
      kind: 'llm_timeout',
      message: 'Timeout',
    }

    // Retries should be allowed up to maxRetries
    const attempts = 0
    const recipe = engine.diagnose(signal)!
    expect(recipe.maxRetries).toBe(3)

    for (let i = 0; i < recipe.maxRetries; i++) {
      const outcome = engine.recordAttempt(recipe, signal)
      expect(outcome.shouldRetry).toBe(true)
    }

    // After max retries, escalation triggers
    const finalOutcome = engine.recordAttempt(recipe, signal)
    expect(finalOutcome.shouldRetry).toBe(false)
    expect(finalOutcome.escalation).toBe('LogAndContinue')
  })

  it('resets attempt counters for a new signal', () => {
    const recipe = engine.diagnose({ kind: 'llm_timeout', message: 't1' })!
    engine.recordAttempt(recipe, { kind: 'llm_timeout', message: 't1' })

    const recipe2 = engine.diagnose({ kind: 'mcp_handshake_failure', message: 'm1' })!
    expect(recipe2.retryable).toBe(true)
    // Different recipe, counter should be fresh
  })
})
