/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_7b17e9a833cc AC coverage: pheromone-decay.ts
 *
 * AC1: computeEffectiveStrength uses exponential decay formula
 * AC2: trails with effective_strength < 0.1 (epsilon) are marked weak
 * AC3: applyDecayFilter sorts by effective_strength desc, excludes weak trails
 */

import { describe, it, expect } from 'vitest'
import { computeEffectiveStrength, applyDecayFilter, type PheromonMemory } from '../core/memory/pheromone-decay.js'

// ── computeEffectiveStrength ──────────────────────────────────────────────────

describe('computeEffectiveStrength', () => {
  it('AC1: strength * e^0 = strength when date is today (within same day)', () => {
    const today = new Date().toISOString().slice(0, 10)
    const content = JSON.stringify({ strength: 1.0, date: today })
    const result = computeEffectiveStrength(content, new Date())
    // At most 1 day old (midnight UTC vs now) → e^(-0.05*1) ≈ 0.95
    expect(result).toBeGreaterThan(0.9)
    expect(result).toBeLessThanOrEqual(1.0)
  })

  it('AC1: decays after 14 days to ~0.5 (half-life=14d, rate=0.05)', () => {
    const past = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    const dateStr = past.toISOString().slice(0, 10)
    const content = JSON.stringify({ strength: 1.0, date: dateStr })
    const result = computeEffectiveStrength(content, new Date())
    // e^(-0.05 * 14) ≈ 0.496
    expect(result).toBeCloseTo(0.496, 1)
  })

  it('AC1: returns 0 for invalid JSON content', () => {
    const result = computeEffectiveStrength('not json', new Date())
    expect(result).toBe(0)
  })

  it('AC1: returns 0 when strength is missing', () => {
    const content = JSON.stringify({ date: '2026-01-01' })
    const result = computeEffectiveStrength(content, new Date())
    expect(result).toBe(0)
  })

  it('AC1: uses today as reference when date field is missing', () => {
    const content = JSON.stringify({ strength: 0.5 })
    const result = computeEffectiveStrength(content, new Date())
    expect(result).toBeCloseTo(0.5, 3)
  })

  it('AC1: older trail has lower effective_strength than recent trail', () => {
    const recent = new Date().toISOString().slice(0, 10)
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const now = new Date()
    const recentStrength = computeEffectiveStrength(JSON.stringify({ strength: 1, date: recent }), now)
    const oldStrength = computeEffectiveStrength(JSON.stringify({ strength: 1, date: old }), now)
    expect(recentStrength).toBeGreaterThan(oldStrength)
  })

  it('AC1: proportional to input strength', () => {
    const today = new Date().toISOString().slice(0, 10)
    const now = new Date()
    const s1 = computeEffectiveStrength(JSON.stringify({ strength: 2.0, date: today }), now)
    const s2 = computeEffectiveStrength(JSON.stringify({ strength: 1.0, date: today }), now)
    expect(s1).toBeCloseTo(s2 * 2, 3)
  })
})

// ── applyDecayFilter ──────────────────────────────────────────────────────────

describe('applyDecayFilter', () => {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  function makeTrail(name: string, strength: number, daysOld = 0): PheromonMemory {
    const date = new Date(now.getTime() - daysOld * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    return { name, content: JSON.stringify({ strength, date }) }
  }

  it('AC2: excludes trails with effective_strength < 0.1', () => {
    const weak = makeTrail('pheromone-weak', 0.05, 0) // 0.05 < 0.1 → excluded
    const strong = makeTrail('pheromone-strong', 1.0, 0)
    const result = applyDecayFilter([weak, strong], now)
    expect(result.map((r) => r.name)).not.toContain('pheromone-weak')
    expect(result.map((r) => r.name)).toContain('pheromone-strong')
  })

  it('AC2: includes trails with effective_strength >= 0.1', () => {
    const trail = makeTrail('trail-1', 0.5, 0)
    const result = applyDecayFilter([trail], now)
    expect(result).toHaveLength(1)
  })

  it('AC3: sorts by effective_strength descending', () => {
    const low = makeTrail('low', 0.2, 0)
    const high = makeTrail('high', 0.9, 0)
    const mid = makeTrail('mid', 0.5, 0)
    const result = applyDecayFilter([low, high, mid], now)
    expect(result[0]!.name).toBe('high')
    expect(result[1]!.name).toBe('mid')
    expect(result[2]!.name).toBe('low')
  })

  it('AC3: returns empty array when all trails are weak', () => {
    const weak = makeTrail('weak1', 0.01, 0)
    const result = applyDecayFilter([weak], now)
    expect(result).toHaveLength(0)
  })

  it('AC3: includes effective_strength in result', () => {
    const trail = makeTrail('trail', 1.0, 0)
    const result = applyDecayFilter([trail], now)
    expect(typeof result[0]!.effectiveStrength).toBe('number')
    // today's trail: at most 1 day old due to UTC midnight parsing → e^(-0.05*1) > 0.9
    expect(result[0]!.effectiveStrength).toBeGreaterThan(0.9)
    expect(result[0]!.effectiveStrength).toBeLessThanOrEqual(1.0)
  })

  it('AC3: empty input returns empty result', () => {
    const result = applyDecayFilter([], now)
    expect(result).toHaveLength(0)
  })

  it('AC3: trail decayed by 14 days from strength=0.3 ~ 0.149 — included (>0.1)', () => {
    const trail = makeTrail('trail', 0.3, 14) // 0.3 * e^(-0.05*14) ≈ 0.149
    const result = applyDecayFilter([trail], now)
    expect(result).toHaveLength(1)
    expect(result[0]!.effectiveStrength).toBeGreaterThan(0.1)
  })

  it('AC3: day=0 trail for today with strength=0.12 — preserved', () => {
    const trail = { name: 'fresh', content: JSON.stringify({ strength: 0.12, date: today }) }
    const result = applyDecayFilter([trail], now)
    expect(result).toHaveLength(1)
  })
})
