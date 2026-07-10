import { describe, it, expect } from 'vitest'
import {
  MODEL_PRICING,
  getModelPricing,
  calculateCost,
  getDefaultPricing,
  formatPricing,
  calculateCostWithPricing,
  CACHE_HIT_RATE,
} from '../core/observability/cost-tracker.js'

describe('MODEL_PRICING', () => {
  it('is a non-empty Map', () => {
    expect(MODEL_PRICING instanceof Map).toBe(true)
    expect(MODEL_PRICING.size).toBeGreaterThan(0)
  })

  it('contains claude-sonnet-4', () => {
    expect(MODEL_PRICING.has('claude-sonnet-4')).toBe(true)
  })

  it('each entry has inputPer1M and outputPer1M', () => {
    for (const [, pricing] of MODEL_PRICING) {
      expect(typeof pricing.inputPer1M).toBe('number')
      expect(typeof pricing.outputPer1M).toBe('number')
    }
  })
})

describe('getModelPricing', () => {
  it('returns pricing for exact model match', () => {
    const pricing = getModelPricing('claude-sonnet-4')
    expect(pricing).toBeDefined()
    expect(typeof pricing!.inputPer1M).toBe('number')
  })

  it('returns pricing for prefix match', () => {
    const pricing = getModelPricing('claude-sonnet-4-20250514')
    expect(pricing).toBeDefined()
  })

  it('returns undefined for unknown model', () => {
    expect(getModelPricing('totally-unknown-model-xyz')).toBeUndefined()
  })
})

describe('calculateCost', () => {
  it('returns a CostBreakdown object', () => {
    const result = calculateCost('claude-haiku-4', 1000, 500)
    expect(typeof result.totalUsd).toBe('number')
    expect(typeof result.inputCostUsd).toBe('number')
    expect(typeof result.outputCostUsd).toBe('number')
    expect(result.model).toBe('claude-haiku-4')
  })

  it('returns zero cost for unknown model', () => {
    const result = calculateCost('unknown-model', 1000, 500)
    expect(result.totalUsd).toBe(0)
  })

  it('totalUsd = inputCostUsd + outputCostUsd', () => {
    const result = calculateCost('gpt-4o', 10000, 5000)
    expect(result.totalUsd).toBeCloseTo(result.inputCostUsd + result.outputCostUsd, 10)
  })

  it('cached tokens reduce input cost', () => {
    const withoutCache = calculateCost('claude-sonnet-4', 1000, 0, 0)
    const withCache = calculateCost('claude-sonnet-4', 1000, 0, 1000)
    expect(withCache.inputCostUsd).toBeLessThan(withoutCache.inputCostUsd)
  })
})

describe('CACHE_HIT_RATE', () => {
  it('is 0.1 (10% of input rate)', () => {
    expect(CACHE_HIT_RATE).toBe(0.1)
  })
})

describe('getDefaultPricing', () => {
  it('returns a CustomPricing object', () => {
    const pricing = getDefaultPricing()
    expect(typeof pricing.inputPer1M).toBe('number')
    expect(typeof pricing.outputPer1M).toBe('number')
    expect(typeof pricing.cachePer1M).toBe('number')
  })
})

describe('formatPricing', () => {
  it('returns a non-empty string', () => {
    const result = formatPricing(getDefaultPricing())
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('contains tok_in and tok_out markers', () => {
    const result = formatPricing(getDefaultPricing())
    expect(result).toContain('tok_in')
    expect(result).toContain('tok_out')
  })
})

describe('calculateCostWithPricing', () => {
  it('calculates cost with custom pricing', () => {
    const pricing = { inputPer1M: 10.0, outputPer1M: 20.0, cachePer1M: 1.0 }
    const result = calculateCostWithPricing(pricing, 1_000_000, 1_000_000)
    expect(result.inputCostUsd).toBeCloseTo(10.0, 5)
    expect(result.outputCostUsd).toBeCloseTo(20.0, 5)
    expect(result.model).toBe('custom')
  })

  it('applies cache pricing for cached tokens', () => {
    const pricing = { inputPer1M: 10.0, outputPer1M: 20.0, cachePer1M: 1.0 }
    const result = calculateCostWithPricing(pricing, 1_000_000, 0, 1_000_000)
    expect(result.inputCostUsd).toBeCloseTo(1.0, 5)
  })
})
