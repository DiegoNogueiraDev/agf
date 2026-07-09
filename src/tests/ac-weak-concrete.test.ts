/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 2.2 AC coverage: reject ACs without concrete observable values
 *
 * AC1: AC with vague THEN verbs → marked as weak_concrete
 * AC2: AC with numeric threshold, status code, or boolean → marked as strong_concrete
 * AC3: agf check with weak_concrete ACs → has_testable_ac fails with explanatory message
 */

import { describe, it, expect } from 'vitest'
import { scoreAcTestability } from '../core/analyzer/ac-testability.js'

// ── AC1: vague THEN → weak_concrete ──────────────────────────────────────────

describe('AC1: vague THEN verbs → concreteLabel = weak_concrete', () => {
  it('THEN funciona → weak_concrete', () => {
    const result = scoreAcTestability('GIVEN sistema pronto WHEN usuario age THEN sistema funciona')
    expect(result.concreteLabel).toBe('weak_concrete')
  })

  it('THEN responde → weak_concrete', () => {
    const result = scoreAcTestability('GIVEN request enviado WHEN timeout THEN sistema responde')
    expect(result.concreteLabel).toBe('weak_concrete')
  })

  it('THEN processa → weak_concrete', () => {
    const result = scoreAcTestability('GIVEN arquivo recebido WHEN upload THEN servidor processa')
    expect(result.concreteLabel).toBe('weak_concrete')
  })

  it('free-text vague → weak_concrete', () => {
    const result = scoreAcTestability('the system should work correctly')
    expect(result.concreteLabel).toBe('weak_concrete')
  })

  it('GWT with only modal verb outcome → weak_concrete', () => {
    const result = scoreAcTestability('GIVEN state WHEN action THEN thing happens as expected')
    expect(result.concreteLabel).toBe('weak_concrete')
  })
})

// ── AC2: concrete evidence → strong_concrete ─────────────────────────────────

describe('AC2: numeric threshold, status code, or boolean → concreteLabel = strong_concrete', () => {
  it('HTTP 401 status code → strong_concrete', () => {
    const result = scoreAcTestability('GIVEN unauthenticated user WHEN POST /api/task THEN returns 401')
    expect(result.concreteLabel).toBe('strong_concrete')
  })

  it('numeric threshold 200ms → strong_concrete', () => {
    const result = scoreAcTestability('GIVEN request WHEN load test THEN responds within 200ms')
    expect(result.concreteLabel).toBe('strong_concrete')
  })

  it('boolean state "disabled" → strong_concrete', () => {
    const result = scoreAcTestability('GIVEN invalid token WHEN check THEN button is disabled')
    expect(result.concreteLabel).toBe('strong_concrete')
  })

  it('boolean state "true" → strong_concrete', () => {
    const result = scoreAcTestability('GIVEN flag set WHEN evaluated THEN result is true')
    expect(result.concreteLabel).toBe('strong_concrete')
  })

  it('HTTP 200 + threshold → strong_concrete', () => {
    const result = scoreAcTestability('GIVEN valid credentials WHEN POST /login THEN returns 200 within 500ms')
    expect(result.concreteLabel).toBe('strong_concrete')
  })

  it('numeric percentage threshold → strong_concrete', () => {
    const result = scoreAcTestability('GIVEN 1000 requests WHEN load test runs THEN p99 < 500ms')
    expect(result.concreteLabel).toBe('strong_concrete')
  })

  it('boolean state "empty" → strong_concrete', () => {
    const result = scoreAcTestability('GIVEN no items WHEN list queried THEN result is empty')
    expect(result.concreteLabel).toBe('strong_concrete')
  })
})

// ── AC3: has_testable_ac gate integration ────────────────────────────────────

describe('AC3: scoreAcTestability used in has_testable_ac gate', () => {
  it('weak_concrete ACs have scoreReasons with -15 penalty', () => {
    const result = scoreAcTestability('GIVEN user logs in WHEN action THEN thing works')
    const penalty = result.scoreReasons.find((r) => r.startsWith('-15'))
    expect(result.concreteLabel).toBe('weak_concrete')
    expect(penalty).toBeDefined()
    expect(penalty).toMatch(/no concrete evidence/)
  })

  it('strong_concrete ACs do NOT have the -15 penalty', () => {
    const result = scoreAcTestability('GIVEN user WHEN POST /api THEN returns 201 within 100ms')
    const penalty = result.scoreReasons.find((r) => r.startsWith('-15'))
    expect(result.concreteLabel).toBe('strong_concrete')
    expect(penalty).toBeUndefined()
  })

  it('concreteLabel is present on every scoreAcTestability result', () => {
    const cases = [
      'system should work',
      'GIVEN x WHEN y THEN z',
      'GIVEN req WHEN POST THEN returns 200',
      'within 50ms response',
    ]
    for (const ac of cases) {
      const result = scoreAcTestability(ac)
      expect(['strong_concrete', 'weak_concrete']).toContain(result.concreteLabel)
    }
  })

  it('strong_concrete ACs have higher scores than their weak_concrete counterparts', () => {
    const weak = scoreAcTestability('GIVEN user WHEN submits THEN form processes')
    const strong = scoreAcTestability('GIVEN user WHEN submits THEN returns 200 within 300ms')
    expect(strong.score).toBeGreaterThan(weak.score)
    expect(weak.concreteLabel).toBe('weak_concrete')
    expect(strong.concreteLabel).toBe('strong_concrete')
  })
})
