/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { monteCarloForecast } from '../core/insights/monte-carlo-forecast.js'

describe('monteCarloForecast (probabilistic delivery dates)', () => {
  it('is deterministic for a fixed seed', () => {
    const a = monteCarloForecast([3, 5, 4, 2, 6], 40, { seed: 7, iterations: 2000 })
    const b = monteCarloForecast([3, 5, 4, 2, 6], 40, { seed: 7, iterations: 2000 })
    expect(a).toEqual(b)
  })

  it('returns monotonic percentiles P50 ≤ P85 ≤ P95', () => {
    const f = monteCarloForecast([3, 5, 4, 2, 6], 60, { seed: 1 })
    expect(f.p50Days).toBeLessThanOrEqual(f.p85Days)
    expect(f.p85Days).toBeLessThanOrEqual(f.p95Days)
  })

  it('returns zero days for an empty backlog', () => {
    const f = monteCarloForecast([3, 5, 4], 0, { seed: 1 })
    expect(f.p50Days).toBe(0)
    expect(f.p95Days).toBe(0)
  })

  it('widens the P95–P50 spread when throughput is more variable', () => {
    const steady = monteCarloForecast([4, 4, 4, 4, 4], 40, { seed: 3 })
    const erratic = monteCarloForecast([1, 7, 1, 7, 1, 7], 40, { seed: 3 })
    const steadySpread = steady.p95Days - steady.p50Days
    const erraticSpread = erratic.p95Days - erratic.p50Days
    expect(erraticSpread).toBeGreaterThanOrEqual(steadySpread)
  })

  it('treats each sample as a 7-day period by default', () => {
    // 10 backlog at a steady 5/period ⇒ ~2 periods ⇒ ~14 days.
    const f = monteCarloForecast([5, 5, 5, 5], 10, { seed: 2 })
    expect(f.p50Days % 7).toBe(0)
    expect(f.p50Days).toBeGreaterThan(0)
  })

  it('caps (stays finite) when throughput is all zeros', () => {
    const f = monteCarloForecast([0, 0, 0], 10, { seed: 1, iterations: 50 })
    expect(Number.isFinite(f.p95Days)).toBe(true)
  })
})
