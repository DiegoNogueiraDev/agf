/*!
 * TDD: agf savings --assert-min CI assertion (node_036b943f9c13).
 *
 * AC1: Given savings below N, agf savings --assert-min N exits non-zero.
 * AC2: Given savings >= N, exits 0 and reports cumulative total.
 */

import { describe, it, expect } from 'vitest'
import { assertMinSavings } from '../core/economy/savings-tracker.js'

describe('AC1 + AC2: assertMinSavings', () => {
  it('returns { pass: false } when actual < threshold', () => {
    const result = assertMinSavings(50, 100)
    expect(result.pass).toBe(false)
    expect(result.actual).toBe(50)
    expect(result.threshold).toBe(100)
  })

  it('returns { pass: true } when actual >= threshold', () => {
    const result = assertMinSavings(200, 100)
    expect(result.pass).toBe(true)
    expect(result.actual).toBe(200)
    expect(result.threshold).toBe(100)
  })

  it('returns { pass: true } when actual == threshold (boundary)', () => {
    const result = assertMinSavings(100, 100)
    expect(result.pass).toBe(true)
  })
})
