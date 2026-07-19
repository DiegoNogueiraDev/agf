/*!
 * Task node_a0dad3efc474 — GWT testability scorer (scoreAcTestability) targeted tests.
 *
 * AC1: Given AC without measurable outcome → score < 60, reasons includes 'no measurable outcome'
 * AC2: Given AC in GWT format → score >= 60
 * AC3: Given empty string → throws typed error (no silent 0)
 */

import { describe, it, expect } from 'vitest'
import { scoreAcTestability, AcValidationError } from '../core/analyzer/ac-testability.js'

describe('scoreAcTestability — GWT scorer', () => {
  it('AC with no measurable outcome scores below 60 and includes reason (AC1)', () => {
    const result = scoreAcTestability('the system should work correctly')
    expect(result.score).toBeLessThan(60)
    const allReasons = [...result.scoreReasons, result.reason ?? ''].join(' ').toLowerCase()
    expect(allReasons).toMatch(/measurable|outcome|no.*outcome|concrete|weak/)
  })

  it('AC in GWT format with numeric threshold scores >= 60 (AC2)', () => {
    // GWT(+30) + numeric threshold like "100ms"(+25) → score ≥ 55; no concrete-evidence penalty
    const result = scoreAcTestability(
      'Given a user submits the form, When the server responds, Then the response time is under 100ms and status is 200',
    )
    expect(result.score).toBeGreaterThanOrEqual(60)
  })

  it('empty string throws AcValidationError (AC3)', () => {
    expect(() => scoreAcTestability('')).toThrowError(AcValidationError)
  })
})
