import { describe, it, expect } from 'vitest'
import {
  EconomyTierSchema,
  CacheKeySchema,
  CacheEntrySchema,
  TierDistributionSchema,
  EconomyStatsSchema,
  ComplexityClassSchema,
} from '../core/economy/economy-types.js'

describe('EconomyTierSchema', () => {
  it('accepts tiers 0, 1, 2', () => {
    expect(EconomyTierSchema.safeParse(0).success).toBe(true)
    expect(EconomyTierSchema.safeParse(1).success).toBe(true)
    expect(EconomyTierSchema.safeParse(2).success).toBe(true)
  })

  it('rejects tier 3', () => {
    expect(EconomyTierSchema.safeParse(3).success).toBe(false)
  })
})

describe('CacheKeySchema', () => {
  it('accepts a valid cache key', () => {
    expect(
      CacheKeySchema.safeParse({
        toolName: 'agf-next',
        argsHash: 'abc123',
        schemaVersion: 1,
      }).success,
    ).toBe(true)
  })

  it('accepts with optional model', () => {
    expect(
      CacheKeySchema.safeParse({
        toolName: 'agf-next',
        argsHash: 'abc123',
        schemaVersion: 0,
        model: 'claude-sonnet-4-6',
      }).success,
    ).toBe(true)
  })

  it('rejects empty toolName', () => {
    expect(CacheKeySchema.safeParse({ toolName: '', argsHash: 'h', schemaVersion: 0 }).success).toBe(false)
  })

  it('rejects negative schemaVersion', () => {
    expect(CacheKeySchema.safeParse({ toolName: 't', argsHash: 'h', schemaVersion: -1 }).success).toBe(false)
  })
})

describe('CacheEntrySchema', () => {
  it('accepts a valid cache entry', () => {
    expect(
      CacheEntrySchema.safeParse({
        key: 'cache:agf-next:abc',
        value: '{"result": "ok"}',
        createdAt: '2026-06-22T00:00:00Z',
      }).success,
    ).toBe(true)
  })

  it('defaults hitCount to 0', () => {
    const r = CacheEntrySchema.safeParse({
      key: 'k',
      value: 'v',
      createdAt: '2026-01-01',
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.hitCount).toBe(0)
  })

  it('rejects empty key', () => {
    expect(CacheEntrySchema.safeParse({ key: '', value: 'v', createdAt: '2026-01-01' }).success).toBe(false)
  })
})

describe('TierDistributionSchema', () => {
  it('accepts valid tier counts', () => {
    expect(TierDistributionSchema.safeParse({ tier0: 10, tier1: 5, tier2: 2 }).success).toBe(true)
  })

  it('rejects negative values', () => {
    expect(TierDistributionSchema.safeParse({ tier0: -1, tier1: 0, tier2: 0 }).success).toBe(false)
  })
})

describe('ComplexityClassSchema', () => {
  it('accepts all classes', () => {
    for (const c of ['trivial', 'simple', 'complex', 'critical']) {
      expect(ComplexityClassSchema.safeParse(c).success).toBe(true)
    }
  })

  it('rejects unknown class', () => {
    expect(ComplexityClassSchema.safeParse('moderate').success).toBe(false)
  })
})

describe('EconomyStatsSchema', () => {
  it('accepts valid stats', () => {
    expect(
      EconomyStatsSchema.safeParse({
        tokensSavedTotal: 1000,
        costSavedUsd: 0.05,
        cacheHitRate: 0.75,
        boosterHitRate: 0.5,
        tierDistribution: { tier0: 10, tier1: 5, tier2: 2 },
        avgLatencyPerTierMs: { tier0: 5, tier1: 50, tier2: 200 },
      }).success,
    ).toBe(true)
  })

  it('rejects hitRate > 1', () => {
    expect(
      EconomyStatsSchema.safeParse({
        tokensSavedTotal: 0,
        costSavedUsd: 0,
        cacheHitRate: 1.5,
        boosterHitRate: 0,
        tierDistribution: { tier0: 0, tier1: 0, tier2: 0 },
        avgLatencyPerTierMs: { tier0: 0, tier1: 0, tier2: 0 },
      }).success,
    ).toBe(false)
  })
})
