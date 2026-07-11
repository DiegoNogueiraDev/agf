/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { calculateParetoPriority } from '../core/harness/pareto-priority.js'
import type { DimensionGap } from '../core/harness/pareto-priority.js'

describe('calculateParetoPriority', () => {
  it('returns prioritized list sorted by impact desc', () => {
    const gaps: DimensionGap[] = [
      { dimension: 'types', score: 50, weight: 0.25, gap: 50 },
      { dimension: 'tests', score: 80, weight: 0.25, gap: 20 },
      { dimension: 'naming', score: 90, weight: 0.1, gap: 10 },
    ]
    const r = calculateParetoPriority(gaps)
    expect(r).toHaveLength(3)
    expect(r[0].dimension).toBe('types')
    expect(r[0].impact).toBe(12.5) // 50 * 0.25
    expect(r[1].dimension).toBe('tests')
    expect(r[1].impact).toBe(5) // 20 * 0.25
  })

  it('marks top 20% as Pareto', () => {
    const gaps: DimensionGap[] = [
      { dimension: 'types', score: 0, weight: 0.25, gap: 100 },
      { dimension: 'tests', score: 0, weight: 0.25, gap: 100 },
      { dimension: 'naming', score: 0, weight: 0.1, gap: 100 },
      { dimension: 'errors', score: 0, weight: 0.05, gap: 100 },
      { dimension: 'context', score: 0, weight: 0.05, gap: 100 },
    ]
    const r = calculateParetoPriority(gaps)
    const pareto = r.filter((d) => d.isPareto)
    expect(pareto).toHaveLength(1) // ceil(5 * 0.2) = 1
    expect(pareto[0].dimension).toBe('types') // highest impact
  })

  it('returns at least 1 Pareto even for small sets', () => {
    const gaps: DimensionGap[] = [{ dimension: 'types', score: 50, weight: 0.25, gap: 50 }]
    const r = calculateParetoPriority(gaps)
    expect(r).toHaveLength(1)
    expect(r[0].isPareto).toBe(true)
  })

  it('returns empty for empty input', () => {
    expect(calculateParetoPriority([])).toEqual([])
  })

  it('handles zero gap dimensions', () => {
    const gaps: DimensionGap[] = [
      { dimension: 'types', score: 100, weight: 0.25, gap: 0 },
      { dimension: 'tests', score: 100, weight: 0.25, gap: 0 },
    ]
    const r = calculateParetoPriority(gaps)
    expect(r.every((d) => d.impact === 0)).toBe(true)
  })
})
