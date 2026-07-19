/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { computeSavings } from '../core/harness/savings-calculator.js'

describe('computeSavings', () => {
  it('returns unknown source with 0 savings when baselineN is 0', () => {
    const result = computeSavings({
      blockType: 'regression_gate',
      tokensConsumed: 1000,
      baselineContinuation: 5000,
      baselineN: 0,
    })
    expect(result.savingsTokens).toBe(0)
    expect(result.confidence).toBe(0)
    expect(result.source).toBe('unknown')
    expect(result.baselineN).toBe(0)
  })

  it('returns estimated source with 1-2 samples', () => {
    const result = computeSavings({
      blockType: 'regression_gate',
      tokensConsumed: 1000,
      baselineContinuation: 5000,
      baselineN: 1,
    })
    expect(result.savingsTokens).toBe(4000)
    expect(result.source).toBe('estimated')
    expect(result.confidence).toBeLessThan(1)
  })

  it('returns measured source with 3+ samples', () => {
    const result = computeSavings({
      blockType: 'regression_gate',
      tokensConsumed: 2000,
      baselineContinuation: 6000,
      baselineN: 5,
    })
    expect(result.savingsTokens).toBe(4000)
    expect(result.source).toBe('measured')
    expect(result.confidence).toBe(0.5)
  })

  it('returns 0 savings when tokens consumed exceeds baseline', () => {
    const result = computeSavings({
      blockType: 'regression_gate',
      tokensConsumed: 10000,
      baselineContinuation: 5000,
      baselineN: 5,
    })
    expect(result.savingsTokens).toBe(0)
  })

  it('caps confidence at 1.0', () => {
    const result = computeSavings({
      blockType: 'regression_gate',
      tokensConsumed: 1000,
      baselineContinuation: 5000,
      baselineN: 20,
    })
    expect(result.confidence).toBe(1)
  })

  it('handles negative baselineN by clamping to 0', () => {
    const result = computeSavings({
      blockType: 'test',
      tokensConsumed: 100,
      baselineContinuation: 500,
      baselineN: -5,
    })
    expect(result.baselineN).toBe(0)
    expect(result.source).toBe('unknown')
  })

  it('passes through blockType', () => {
    const result = computeSavings({
      blockType: 'my_custom_gate',
      tokensConsumed: 100,
      baselineContinuation: 500,
      baselineN: 3,
    })
    expect(result.blockType).toBe('my_custom_gate')
  })
})
