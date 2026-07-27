/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_cd67e1e750d2 — heal-on-failure: on a failed task the loop runs a
 * MAPE-K dry-run diagnosis (apply:false) and surfaces it in the escalation,
 * never auto-mutating the graph and never retrying blindly.
 */
import { describe, it, expect } from 'vitest'
import { healingToRecovery, lookupKnownFix, classifyFailure } from '../core/autonomy/heal-gate.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { HelperRecordStore } from '../core/autonomy/helper-record-store.js'

describe('healingToRecovery (#node_cd67e1e750d2)', () => {
  it('never retries (diagnose-only) and reports the detected count', () => {
    const decision = healingToRecovery({ detected: 3, applied: 0, report: { actions: [] } as never })
    expect(decision.retry).toBe(false)
    expect(decision.reason).toContain('3')
    expect(decision.reason?.toLowerCase()).toContain('heal')
  })

  it('reports cleanly when nothing was detected', () => {
    const decision = healingToRecovery({ detected: 0, applied: 0, report: { actions: [] } as never })
    expect(decision.retry).toBe(false)
    expect(decision.reason).toContain('0')
  })
})

// AC: GIVEN a known failure signature WHEN looked up via the heal surface
// THEN the persisted helper-record fix is returned (T3.3, node_wire_15ee61946beb).
describe('lookupKnownFix (#node_wire_15ee61946beb)', () => {
  it('returns the known fix for a signature already recorded in the store', () => {
    const store = SqliteStore.open(':memory:')
    store.initProject('test-project')
    const projectId = store.getProject()?.id ?? 'default'
    new HelperRecordStore(store.getDb(), projectId).put({
      signature: 'element_obscured',
      fix: { action: 'scroll_into_view' },
    })

    const result = lookupKnownFix(store, 'element_obscured', 1_700_000_000_000)

    expect(result.known).toBe(true)
    expect(result.fix).toEqual({ action: 'scroll_into_view' })
    store.close()
  })

  it('reports not-known for a signature never recorded', () => {
    const store = SqliteStore.open(':memory:')
    store.initProject('test-project')

    const result = lookupKnownFix(store, 'never_seen', 1_700_000_000_000)

    expect(result.known).toBe(false)
    expect(result.fix).toBeNull()
    store.close()
  })
})

// AC: GIVEN a raw failure-kind string WHEN classified via the heal surface
// THEN the deterministic recovery-recipes engine's recipe is returned, with
// unrecognized kinds falling back to 'unknown_failure' (node_wire_8f2d2d6db4fc).
describe('classifyFailure (#node_wire_8f2d2d6db4fc)', () => {
  it('returns the retryable recipe for a known failure kind', () => {
    const recipe = classifyFailure('llm_timeout')
    expect(recipe.kind).toBe('llm_timeout')
    expect(recipe.retryable).toBe(true)
    expect(recipe.escalation).toBe('LogAndContinue')
  })

  it('returns the non-retryable AlertHuman recipe for llm_auth_error', () => {
    const recipe = classifyFailure('llm_auth_error')
    expect(recipe.retryable).toBe(false)
    expect(recipe.escalation).toBe('AlertHuman')
  })

  it('falls back to unknown_failure for an unrecognized kind', () => {
    const recipe = classifyFailure('not_a_real_kind')
    expect(recipe.kind).toBe('unknown_failure')
    expect(recipe.retryable).toBe(false)
    expect(recipe.escalation).toBe('AlertHuman')
  })
})
