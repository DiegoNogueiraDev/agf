/*!
 * Task node_55defb4a8e9f — AC ambiguity linter.
 *
 * AC1: Given an AC containing 'should be fast', When linted,
 *      Then flagged as ambiguous with suggestion 'definir limite mensurável'.
 * AC2: Given a quantified AC, When linted, Then NOT flagged.
 */

import { describe, it, expect } from 'vitest'
import { lintAcAmbiguity, type AcLintResult } from '../core/analyzer/ac-linter.js'

describe('lintAcAmbiguity', () => {
  it('flags "should be fast" as ambiguous with measurable suggestion (AC1)', () => {
    const result: AcLintResult = lintAcAmbiguity('The response should be fast')
    expect(result.ambiguous).toBe(true)
    expect(result.vagueTerms.length).toBeGreaterThan(0)
    expect(result.suggestion).toMatch(/limite|mensur|threshold|measur/i)
  })

  it('does not flag an AC with explicit numeric threshold (AC2)', () => {
    const result = lintAcAmbiguity('Response time must be under 200ms')
    expect(result.ambiguous).toBe(false)
  })

  it('flags common vague phrases: "should work", "easy to use", "acceptable"', () => {
    for (const phrase of ['should work', 'easy to use', 'acceptable performance']) {
      const r = lintAcAmbiguity(`System ${phrase} under load`)
      expect(r.ambiguous).toBe(true)
    }
  })
})
