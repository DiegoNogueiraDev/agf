/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_f4cf31fb4704 — calculateCost returned a silent totalUsd:0 for a model with
 * no pricing entry, so an expensive model (claude-sonnet-5, absent from the table)
 * was counted as FREE — a false economy signal (seen distorting the live A/B). Fix:
 * a pricingKnown flag so a $0 is never mistaken for free, + real OpenRouter prices
 * for the models actually in use.
 */

import { describe, it, expect } from 'vitest'
import { calculateCost } from '../core/observability/cost-tracker.js'

describe('calculateCost — pricingKnown flag + real prices for in-use models', () => {
  it('flags an unknown-priced model as pricingKnown:false (a $0 is NOT "free")', () => {
    const c = calculateCost('totally-unknown-model-zzz-2099', 1000, 1000)
    expect(c.pricingKnown).toBe(false)
    expect(c.totalUsd).toBe(0)
  })

  it('claude-sonnet-5 now has real OpenRouter pricing ($2/$10 per 1M) and pricingKnown:true', () => {
    const c = calculateCost('anthropic/claude-sonnet-5', 1_000_000, 1_000_000)
    expect(c.pricingKnown).toBe(true)
    expect(c.inputCostUsd).toBeCloseTo(2.0, 4)
    expect(c.outputCostUsd).toBeCloseTo(10.0, 4)
    expect(c.totalUsd).toBeCloseTo(12.0, 4)
  })

  it('qwen3.6-plus has real pricing ($0.325/$1.95 per 1M)', () => {
    const c = calculateCost('qwen/qwen3.6-plus', 1_000_000, 1_000_000)
    expect(c.pricingKnown).toBe(true)
    expect(c.inputCostUsd).toBeCloseTo(0.325, 4)
    expect(c.outputCostUsd).toBeCloseTo(1.95, 4)
  })

  it('deepseek-v4-flash has real pricing ($0.098/$0.196 per 1M)', () => {
    const c = calculateCost('deepseek/deepseek-v4-flash', 1_000_000, 1_000_000)
    expect(c.pricingKnown).toBe(true)
    expect(c.inputCostUsd).toBeCloseTo(0.098, 4)
    expect(c.outputCostUsd).toBeCloseTo(0.196, 4)
  })

  it('a known legacy model keeps pricingKnown:true (no regression)', () => {
    expect(calculateCost('claude-sonnet-4', 1_000_000, 0).pricingKnown).toBe(true)
  })
})
