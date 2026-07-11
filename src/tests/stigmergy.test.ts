/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { PheromoneTrail } from '../core/economy/stigmergy.js'

const HOUR = 60 * 60 * 1000

describe('PheromoneTrail (stigmergy with exponential evaporation)', () => {
  it('deposit raises a trail strength above zero', () => {
    const t = new PheromoneTrail({ halfLifeMs: HOUR })
    expect(t.strength('a:b', 0)).toBe(0)
    t.deposit('a:b', 1, 0)
    expect(t.strength('a:b', 0)).toBeGreaterThan(0)
  })

  it('evaporates by half after one half-life', () => {
    const t = new PheromoneTrail({ halfLifeMs: HOUR })
    t.deposit('x', 1, 0)
    const s0 = t.strength('x', 0)
    const sHalf = t.strength('x', HOUR)
    expect(sHalf / s0).toBeCloseTo(0.5, 2)
  })

  it('reinforces with repeated deposits (shorter, busier trails win)', () => {
    const t = new PheromoneTrail({ halfLifeMs: HOUR })
    t.deposit('busy', 1, 0)
    t.deposit('busy', 1, 0)
    t.deposit('quiet', 1, 0)
    expect(t.strength('busy', 0)).toBeGreaterThan(t.strength('quiet', 0))
  })

  it('strongest() returns the highest current-strength trail', () => {
    const t = new PheromoneTrail({ halfLifeMs: HOUR })
    t.deposit('old', 1, 0)
    t.deposit('new', 1, 10 * HOUR)
    const best = t.strongest(['old', 'new'], 10 * HOUR)
    expect(best?.key).toBe('new') // 'old' has evaporated away
  })

  it('strongest() returns null when no trail has meaningful strength', () => {
    const t = new PheromoneTrail({ halfLifeMs: HOUR })
    expect(t.strongest(['none'], 0)).toBeNull()
  })

  it('rejects a non-positive half-life', () => {
    expect(() => new PheromoneTrail({ halfLifeMs: 0 })).toThrow()
  })
})
