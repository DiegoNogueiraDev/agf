/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_1390f8ac3631 — E3.1: pheromone memory format with evaporation_rate + last_reinforced
 *
 * AC: evaporation_rate (default 0.05), last_reinforced fields;
 *     effective_strength = strength * e^(-rate * days);
 *     exponential decay formula
 */

import { describe, it, expect } from 'vitest'
import {
  computeEffectiveStrength,
  buildPheromoneMemoryContent,
  parsePheromoneMemoryContent,
  DEFAULT_EVAPORATION_RATE,
  type PheromoneMemoryContent,
} from '../core/colony/pheromone-memory.js'

// ── DEFAULT_EVAPORATION_RATE ────────────────────────────────────────────────────

describe('DEFAULT_EVAPORATION_RATE', () => {
  it('is 0.05', () => {
    expect(DEFAULT_EVAPORATION_RATE).toBe(0.05)
  })
})

// ── computeEffectiveStrength ────────────────────────────────────────────────────

describe('computeEffectiveStrength', () => {
  it('returns strength unchanged at day 0', () => {
    const now = new Date()
    const result = computeEffectiveStrength(1.0, 0.05, now, now)
    expect(result).toBeCloseTo(1.0, 3)
  })

  it('applies exponential decay after 1 day with rate 0.05', () => {
    const lastReinforced = new Date(Date.now() - 86400 * 1000)
    const now = new Date()
    const result = computeEffectiveStrength(1.0, 0.05, lastReinforced, now)
    // strength * e^(-0.05 * 1) ≈ 0.951
    expect(result).toBeCloseTo(Math.exp(-0.05), 2)
  })

  it('uses DEFAULT_EVAPORATION_RATE when rate is not provided', () => {
    const lastReinforced = new Date(Date.now() - 86400 * 1000 * 10)
    const now = new Date()
    const withDefault = computeEffectiveStrength(1.0, DEFAULT_EVAPORATION_RATE, lastReinforced, now)
    const withExplicit = computeEffectiveStrength(1.0, 0.05, lastReinforced, now)
    expect(withDefault).toBeCloseTo(withExplicit, 5)
  })

  it('decays more with higher rate', () => {
    const lastReinforced = new Date(Date.now() - 86400 * 1000 * 7) // 7 days ago
    const now = new Date()
    const slow = computeEffectiveStrength(1.0, 0.05, lastReinforced, now)
    const fast = computeEffectiveStrength(1.0, 0.2, lastReinforced, now)
    expect(fast).toBeLessThan(slow)
  })

  it('effective_strength decreases over time', () => {
    const lastReinforced = new Date(Date.now() - 86400 * 1000 * 30) // 30 days ago
    const now = new Date()
    const result = computeEffectiveStrength(1.0, 0.05, lastReinforced, now)
    expect(result).toBeLessThan(1.0)
  })

  it('never returns negative values', () => {
    const lastReinforced = new Date(Date.now() - 86400 * 1000 * 365) // 1 year ago
    const now = new Date()
    const result = computeEffectiveStrength(1.0, 0.5, lastReinforced, now)
    expect(result).toBeGreaterThanOrEqual(0)
  })
})

// ── buildPheromoneMemoryContent ────────────────────────────────────────────────

describe('buildPheromoneMemoryContent', () => {
  it('includes evaporation_rate defaulting to 0.05', () => {
    const content = buildPheromoneMemoryContent({ pattern: 'test', tag: 'x', strength: 1.0, date: '2026-06-23' })
    const parsed = JSON.parse(content) as PheromoneMemoryContent
    expect(parsed.evaporation_rate).toBe(DEFAULT_EVAPORATION_RATE)
  })

  it('includes last_reinforced as ISO date string', () => {
    const content = buildPheromoneMemoryContent({ pattern: 'test', tag: 'x', strength: 1.0, date: '2026-06-23' })
    const parsed = JSON.parse(content) as PheromoneMemoryContent
    expect(parsed.last_reinforced).toBeDefined()
    expect(typeof parsed.last_reinforced).toBe('string')
  })

  it('uses provided evaporation_rate', () => {
    const content = buildPheromoneMemoryContent({
      pattern: 'test',
      tag: 'x',
      strength: 1.0,
      date: '2026-06-23',
      evaporation_rate: 0.1,
    })
    const parsed = JSON.parse(content) as PheromoneMemoryContent
    expect(parsed.evaporation_rate).toBe(0.1)
  })
})

// ── parsePheromoneMemoryContent ────────────────────────────────────────────────

describe('parsePheromoneMemoryContent', () => {
  it('returns null for non-JSON content', () => {
    expect(parsePheromoneMemoryContent('not json')).toBeNull()
  })

  it('returns null when strength is missing', () => {
    expect(parsePheromoneMemoryContent(JSON.stringify({ pattern: 'x', tag: 'y' }))).toBeNull()
  })

  it('computes effective_strength from stored fields', () => {
    const content = buildPheromoneMemoryContent({ pattern: 'test', tag: 'x', strength: 1.0, date: '2026-06-23' })
    const parsed = parsePheromoneMemoryContent(content)
    expect(parsed).not.toBeNull()
    expect(parsed!.effective_strength).toBeDefined()
    expect(parsed!.effective_strength).toBeGreaterThan(0)
    expect(parsed!.effective_strength).toBeLessThanOrEqual(1.0)
  })
})
