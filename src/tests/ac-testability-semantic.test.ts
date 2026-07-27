/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Task 5.1: Replace regex-only AC testability scoring with semantic validation.
 * AC1 — modal verb in THEN scores lower than concrete outcome verb.
 * AC2 — AC with only a number and no verb produces semanticWarnings: ['no_outcome_verb'].
 * AC3 — existing tests still pass (no regression — verified separately).
 */

import { describe, it, expect } from 'vitest'
import { scoreAcTestability } from '../core/analyzer/ac-testability.js'

// ── AC1 ───────────────────────────────────────────────────────────────────────

describe('T5.1 AC1: modal verb in outcome scores lower than concrete verb', () => {
  it('THEN should work scores lower than THEN returns x', () => {
    const modal = scoreAcTestability('GIVEN x WHEN y THEN should work')
    const concrete = scoreAcTestability('GIVEN x WHEN y THEN returns x')
    expect(modal.score).toBeLessThan(concrete.score)
  })

  it('THEN would succeed scores lower than THEN returns 200', () => {
    const modal = scoreAcTestability('GIVEN a valid request WHEN submitted THEN would succeed')
    const concrete = scoreAcTestability('GIVEN a valid request WHEN submitted THEN returns 200')
    expect(modal.score).toBeLessThan(concrete.score)
  })

  it('AC with modal verb should have semanticWarnings entry', () => {
    const result = scoreAcTestability('GIVEN x WHEN y THEN should work correctly')
    expect(result.semanticWarnings).toBeDefined()
    expect(Array.isArray(result.semanticWarnings)).toBe(true)
    expect(result.semanticWarnings).toContain('modal_verb_in_outcome')
  })

  it('AC without modal verb has no modal_verb_in_outcome warning', () => {
    const result = scoreAcTestability('GIVEN unauthenticated user WHEN POST /api/task THEN returns 401')
    expect(result.semanticWarnings?.includes('modal_verb_in_outcome')).toBe(false)
  })
})

// ── AC2 ───────────────────────────────────────────────────────────────────────

describe('T5.1 AC2: no verb in THEN clause → no_outcome_verb warning', () => {
  it('GIVEN x WHEN y THEN 200 produces no_outcome_verb warning', () => {
    const result = scoreAcTestability('GIVEN x WHEN y THEN 200')
    expect(result.semanticWarnings).toBeDefined()
    expect(result.semanticWarnings).toContain('no_outcome_verb')
  })

  it('semanticWarnings is always an array (never undefined)', () => {
    const withVerb = scoreAcTestability('GIVEN valid user WHEN login called THEN returns JWT token within 500ms')
    expect(Array.isArray(withVerb.semanticWarnings)).toBe(true)
  })

  it('AC with a concrete outcome verb has empty or no no_outcome_verb warning', () => {
    const result = scoreAcTestability('GIVEN valid credentials WHEN POST /login THEN returns 200 with JWT')
    expect(result.semanticWarnings?.includes('no_outcome_verb')).toBe(false)
  })

  it('AC that is purely vague produces no_outcome_verb warning', () => {
    const result = scoreAcTestability('GIVEN system ready WHEN user acts THEN thing happens')
    expect(Array.isArray(result.semanticWarnings)).toBe(true)
    expect(result.semanticWarnings).toContain('no_outcome_verb')
  })
})
