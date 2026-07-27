/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_60e85950521f — C84-T1: tests for pheromone-memory pure functions
 *
 * AC: computeEffectiveStrength decays over time; buildPheromoneMemoryContent
 *     returns valid JSON; parsePheromoneMemoryContent returns null for invalid;
 *     blast gate passes
 */

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_EVAPORATION_RATE,
  computeEffectiveStrength,
  buildPheromoneMemoryContent,
  parsePheromoneMemoryContent,
} from '../core/colony/pheromone-memory.js'
import type { PheromoneMemoryInput } from '../core/colony/pheromone-memory.js'

const NOW = new Date('2026-06-23T00:00:00Z')
const YESTERDAY = new Date('2026-06-22T00:00:00Z')
const WEEK_AGO = new Date('2026-06-16T00:00:00Z')

function makeInput(overrides: Partial<PheromoneMemoryInput> = {}): PheromoneMemoryInput {
  return {
    pattern: 'test pattern',
    tag: 'test',
    strength: 1.0,
    date: '2026-06-23',
    ...overrides,
  }
}

describe('DEFAULT_EVAPORATION_RATE', () => {
  it('is a positive number between 0 and 1', () => {
    expect(DEFAULT_EVAPORATION_RATE).toBeGreaterThan(0)
    expect(DEFAULT_EVAPORATION_RATE).toBeLessThan(1)
  })
})

describe('computeEffectiveStrength', () => {
  it('returns strength unchanged when no time has elapsed', () => {
    const result = computeEffectiveStrength(1.0, DEFAULT_EVAPORATION_RATE, NOW, NOW)
    expect(result).toBeCloseTo(1.0, 5)
  })

  it('decays over time — 1 day elapsed reduces strength', () => {
    const fresh = computeEffectiveStrength(1.0, DEFAULT_EVAPORATION_RATE, NOW, NOW)
    const decayed = computeEffectiveStrength(1.0, DEFAULT_EVAPORATION_RATE, YESTERDAY, NOW)
    expect(decayed).toBeLessThan(fresh)
  })

  it('more time = more decay (week > day)', () => {
    const oneDay = computeEffectiveStrength(1.0, DEFAULT_EVAPORATION_RATE, YESTERDAY, NOW)
    const oneWeek = computeEffectiveStrength(1.0, DEFAULT_EVAPORATION_RATE, WEEK_AGO, NOW)
    expect(oneWeek).toBeLessThan(oneDay)
  })

  it('higher evaporation rate decays faster', () => {
    const slow = computeEffectiveStrength(1.0, 0.01, YESTERDAY, NOW)
    const fast = computeEffectiveStrength(1.0, 0.5, YESTERDAY, NOW)
    expect(fast).toBeLessThan(slow)
  })

  it('returns a positive number', () => {
    const result = computeEffectiveStrength(1.0, DEFAULT_EVAPORATION_RATE, WEEK_AGO, NOW)
    expect(result).toBeGreaterThan(0)
  })

  it('returns a number (not NaN)', () => {
    const result = computeEffectiveStrength(1.0, DEFAULT_EVAPORATION_RATE, YESTERDAY, NOW)
    expect(Number.isNaN(result)).toBe(false)
  })
})

describe('buildPheromoneMemoryContent', () => {
  it('returns a non-empty string', () => {
    const result = buildPheromoneMemoryContent(makeInput())
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('returned string is valid JSON', () => {
    const result = buildPheromoneMemoryContent(makeInput())
    expect(() => JSON.parse(result)).not.toThrow()
  })

  it('parsed JSON contains strength', () => {
    const result = buildPheromoneMemoryContent(makeInput({ strength: 0.8 }))
    const parsed = JSON.parse(result) as Record<string, unknown>
    expect(parsed['strength']).toBe(0.8)
  })

  it('uses default evaporation_rate when not provided', () => {
    const result = buildPheromoneMemoryContent(makeInput())
    const parsed = JSON.parse(result) as Record<string, unknown>
    expect(parsed['evaporation_rate']).toBe(DEFAULT_EVAPORATION_RATE)
  })

  it('preserves custom evaporation_rate', () => {
    const result = buildPheromoneMemoryContent(makeInput({ evaporation_rate: 0.1 }))
    const parsed = JSON.parse(result) as Record<string, unknown>
    expect(parsed['evaporation_rate']).toBe(0.1)
  })
})

describe('parsePheromoneMemoryContent', () => {
  it('returns null for invalid JSON', () => {
    expect(parsePheromoneMemoryContent('not json', NOW)).toBeNull()
  })

  it('returns null when strength field is missing', () => {
    const content = JSON.stringify({ pattern: 'x', tag: 'y', date: '2026-06-23' })
    expect(parsePheromoneMemoryContent(content, NOW)).toBeNull()
  })

  it('returns parsed object for valid content', () => {
    const input = makeInput({ last_reinforced: NOW.toISOString() })
    const content = buildPheromoneMemoryContent(input)
    const result = parsePheromoneMemoryContent(content, NOW)
    expect(result).not.toBeNull()
    expect(result?.strength).toBe(1.0)
  })

  it('returned object has effective_strength field', () => {
    const input = makeInput({ last_reinforced: NOW.toISOString() })
    const content = buildPheromoneMemoryContent(input)
    const result = parsePheromoneMemoryContent(content, NOW)
    expect(typeof result?.effective_strength).toBe('number')
  })

  it('effective_strength equals strength when no decay (same instant)', () => {
    const input = makeInput({ last_reinforced: NOW.toISOString() })
    const content = buildPheromoneMemoryContent(input)
    const result = parsePheromoneMemoryContent(content, NOW)
    expect(result?.effective_strength).toBeCloseTo(1.0, 5)
  })
})
