/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_91af544d4f05 — detect noop_rewrite in agf ac harden.
 * ac-harden.ts wraps a weak AC's original text verbatim into a GWT skeleton
 * ("Given [precondition], When [original], Then [measurable outcome]"). If
 * the original text has no observable outcome verb (just filler like "the
 * system should work"), the wrap adds zero value — noop should be true.
 * Reuses scoreAcTestability's hasObservableOutcome signal (already computed).
 */

import { describe, it, expect } from 'vitest'
import { rewriteWeakAc } from '../core/analyzer/ac-harden.js'

describe('rewriteWeakAc — noop detection', () => {
  it("GIVEN 'the system should work' (weak, no outcome verb) THEN result.noop === true", () => {
    const result = rewriteWeakAc('the system should work')
    expect(result.wasWeak).toBe(true)
    expect(result.noop).toBe(true)
  })

  it("GIVEN 'returns 200 when payload is valid' (weak score but real outcome verb) THEN result.noop === false", () => {
    const result = rewriteWeakAc('returns 200 when payload is valid')
    expect(result.wasWeak).toBe(true)
    expect(result.noop).toBe(false)
  })

  it('GIVEN a strong AC (score >= 60) THEN wasWeak === false and noop === false', () => {
    const result = rewriteWeakAc(
      'Given a user is logged in, When they submit the form with valid data, Then the server returns 200 and saves the record',
    )
    expect(result.wasWeak).toBe(false)
    expect(result.noop).toBe(false)
  })
})
