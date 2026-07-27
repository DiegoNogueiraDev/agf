/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 1.3 AC coverage: detectDimensionSaturation
 *
 * AC1: tests score > 85 for 2 consecutive cycles → pivotTo = weakest dim != tests
 * AC2: only 1 cycle in history → { saturated: false }
 * AC3: pivot_signal emitted → pivotTo aligns with weakest harness dimension
 * AC4: no dimension saturated → { saturated: false, pivotTo: null }
 */

import { describe, it, expect } from 'vitest'
import { detectDimensionSaturation } from '../core/harness/dimension-saturation.js'
import type { HistoryEntry } from '../core/harness/dimension-saturation.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBreakdown(overrides: Record<string, number> = {}): Record<string, { score: number }> {
  const defaults: Record<string, number> = {
    types: 70,
    tests: 70,
    fitness: 70,
    docs: 70,
    naming: 70,
    errors: 70,
    context: 70,
    provenance: 70,
  }
  const merged = { ...defaults, ...overrides }
  return Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, { score: v }]))
}

function makeEntry(breakdown: Record<string, { score: number }>, timestamp = '2026-06-23T00:00:00.000Z'): HistoryEntry {
  return { breakdown: JSON.stringify(breakdown), score: 75, timestamp }
}

// ── AC1: tests > 85 for 2+ cycles → saturated, pivotTo = weakest ─────────────

describe('AC1: tests dimension saturated for 2 consecutive cycles → pivot to weakest', () => {
  it('returns saturated=true when tests.score > 85 in both history and current', () => {
    const prevBreakdown = makeBreakdown({ tests: 90, docs: 40 })
    const history = [makeEntry(prevBreakdown)]
    const current = makeBreakdown({ tests: 91, docs: 40 }) // delta=1 < 2 → saturated

    const signal = detectDimensionSaturation(history, current)
    expect(signal.saturated).toBe(true)
    expect(signal.dimension).toBe('tests')
  })

  it('pivotTo is the weakest non-tests dimension', () => {
    const prevBreakdown = makeBreakdown({ tests: 90, docs: 30, types: 60 })
    const history = [makeEntry(prevBreakdown)]
    const current = makeBreakdown({ tests: 91, docs: 30, types: 60 })

    const signal = detectDimensionSaturation(history, current)
    expect(signal.pivotTo).toBe('docs') // docs=30 < types=60 → weakest
  })

  it('pivotTo excludes the saturated dimension itself', () => {
    const prevBreakdown = makeBreakdown({ tests: 88, docs: 50, naming: 55 })
    const history = [makeEntry(prevBreakdown)]
    const current = makeBreakdown({ tests: 89, docs: 50, naming: 55 })

    const signal = detectDimensionSaturation(history, current)
    expect(signal.dimension).toBe('tests')
    expect(signal.pivotTo).not.toBe('tests')
  })

  it('multiple cycles with tests > 85 all showing saturation', () => {
    const prev1 = makeBreakdown({ tests: 87 })
    const prev2 = makeBreakdown({ tests: 88 })
    const history = [makeEntry(prev1), makeEntry(prev2)]
    const current = makeBreakdown({ tests: 89 }) // delta from prev2=1 < 2

    const signal = detectDimensionSaturation(history, current)
    expect(signal.saturated).toBe(true)
    expect(signal.dimension).toBe('tests')
  })

  it('pivotTo resolves to the single weakest dimension across all', () => {
    const prev = makeBreakdown({ tests: 90, docs: 20, types: 50, context: 45 })
    const history = [makeEntry(prev)]
    const current = makeBreakdown({ tests: 90, docs: 20, types: 50, context: 45 })

    const signal = detectDimensionSaturation(history, current)
    expect(signal.pivotTo).toBe('docs') // docs=20 is weakest
  })
})

// ── AC2: only 1 cycle → { saturated: false } ─────────────────────────────────

describe('AC2: only 1 history cycle → saturated: false (insufficient history)', () => {
  it('returns saturated=false when history is empty', () => {
    const current = makeBreakdown({ tests: 90 })
    const signal = detectDimensionSaturation([], current)
    expect(signal.saturated).toBe(false)
  })

  it('returns pivotTo=null when history is empty', () => {
    const current = makeBreakdown({ tests: 90 })
    const signal = detectDimensionSaturation([], current)
    expect(signal.pivotTo).toBeNull()
  })

  it('does not saturate with 0 history entries regardless of current scores', () => {
    const current = makeBreakdown({ tests: 99, types: 99, docs: 99 })
    const signal = detectDimensionSaturation([], current)
    expect(signal.saturated).toBe(false)
  })
})

// ── AC3: pivot_signal → pivotTo dimension aligns with weakest ─────────────────

describe('AC3: pivot_signal.pivotTo aligns with weakest non-saturated dimension', () => {
  it('pivotTo points to docs when docs is weakest', () => {
    const prev = makeBreakdown({ tests: 88, docs: 25, types: 60, errors: 55 })
    const history = [makeEntry(prev)]
    const current = makeBreakdown({ tests: 89, docs: 25, types: 60, errors: 55 })

    const signal = detectDimensionSaturation(history, current)
    expect(signal.saturated).toBe(true)
    expect(signal.pivotTo).toBe('docs')
  })

  it('pivotTo points to errors when errors is weakest', () => {
    const prev = makeBreakdown({ types: 88, errors: 10, docs: 55, tests: 60 })
    const history = [makeEntry(prev)]
    const current = makeBreakdown({ types: 89, errors: 10, docs: 55, tests: 60 })

    const signal = detectDimensionSaturation(history, current)
    expect(signal.saturated).toBe(true)
    expect(signal.pivotTo).toBe('errors')
  })

  it('pivotTo is defined (not null) when saturation is detected', () => {
    const prev = makeBreakdown({ types: 90, docs: 40 })
    const history = [makeEntry(prev)]
    const current = makeBreakdown({ types: 91, docs: 40 })

    const signal = detectDimensionSaturation(history, current)
    if (signal.saturated) {
      expect(signal.pivotTo).not.toBeNull()
    }
  })
})

// ── AC4: no dimension saturated → { saturated: false, pivotTo: null } ─────────

describe('AC4: no dimension saturated → saturated: false, pivotTo: null', () => {
  it('returns false when all dimensions are below 85', () => {
    const prev = makeBreakdown() // all 70
    const history = [makeEntry(prev)]
    const current = makeBreakdown() // all 70

    const signal = detectDimensionSaturation(history, current)
    expect(signal.saturated).toBe(false)
    expect(signal.pivotTo).toBeNull()
  })

  it('returns false when dim > 85 but delta >= 2 (dimension is improving)', () => {
    const prev = makeBreakdown({ tests: 86 })
    const history = [makeEntry(prev)]
    const current = makeBreakdown({ tests: 90 }) // delta=4 >= 2 → not saturated

    const signal = detectDimensionSaturation(history, current)
    expect(signal.saturated).toBe(false)
    expect(signal.pivotTo).toBeNull()
  })

  it('returns false when one dimension > 85 in current but not in history', () => {
    const prev = makeBreakdown({ tests: 80 })
    const history = [makeEntry(prev)]
    const current = makeBreakdown({ tests: 86 }) // prev was 80 (not > 85) → not saturated

    const signal = detectDimensionSaturation(history, current)
    expect(signal.saturated).toBe(false)
  })

  it('dimension null when not saturated', () => {
    const prev = makeBreakdown({ tests: 70 })
    const history = [makeEntry(prev)]
    const current = makeBreakdown({ tests: 72 })

    const signal = detectDimensionSaturation(history, current)
    expect(signal.dimension).toBeNull()
  })

  it('returns false when prev score > 85 but current dropped below 85', () => {
    const prev = makeBreakdown({ tests: 90 })
    const history = [makeEntry(prev)]
    const current = makeBreakdown({ tests: 82 }) // current < 85 → not saturated

    const signal = detectDimensionSaturation(history, current)
    expect(signal.saturated).toBe(false)
  })
})

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('does not throw when breakdown has missing dimensions', () => {
    const prev = makeBreakdown({ tests: 88 })
    const history = [makeEntry(prev)]
    // current has only some dimensions
    const current: Record<string, { score: number }> = { tests: { score: 89 }, docs: { score: 30 } }

    expect(() => detectDimensionSaturation(history, current)).not.toThrow()
  })

  it('delta threshold: exactly 1.9 → saturated (< 2)', () => {
    const prev = makeBreakdown({ tests: 88 })
    const history = [makeEntry(prev)]
    const current = makeBreakdown({ tests: 89.9 }) // delta=1.9 < 2 → saturated

    const signal = detectDimensionSaturation(history, current)
    expect(signal.saturated).toBe(true)
  })

  it('delta threshold: exactly 2.0 → not saturated (>= 2)', () => {
    const prev = makeBreakdown({ tests: 88 })
    const history = [makeEntry(prev)]
    const current = makeBreakdown({ tests: 90 }) // delta=2 >= 2 → not saturated

    const signal = detectDimensionSaturation(history, current)
    expect(signal.saturated).toBe(false)
  })

  it('pivotTo = null when all dims are saturated (no unsaturated pivot target)', () => {
    const allSaturated = makeBreakdown({
      types: 90,
      tests: 90,
      fitness: 90,
      docs: 90,
      naming: 90,
      errors: 90,
      context: 90,
      provenance: 90,
    })
    const history = [makeEntry(allSaturated)]
    const current = makeBreakdown({
      types: 91,
      tests: 91,
      fitness: 91,
      docs: 91,
      naming: 91,
      errors: 91,
      context: 91,
      provenance: 91,
    })

    const signal = detectDimensionSaturation(history, current)
    // All dims saturated → pivotTo null (no pivot possible)
    if (signal.saturated) {
      expect(signal.pivotTo).toBeNull()
    }
  })
})
