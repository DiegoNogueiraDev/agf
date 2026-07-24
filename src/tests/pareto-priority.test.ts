/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { calculateParetoPriority, buildDimensionGaps } from '../core/harness/pareto-priority.js'
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

describe('buildDimensionGaps — deterministic gaps from a breakdown (node_5ac47cbb19a8)', () => {
  const healthy = {
    types: { score: 90, weight: 0.25 },
    tests: { score: 85, weight: 0.25 },
    fitness: { score: 80, weight: 0.15 },
    docs: { score: 75, weight: 0.1 },
    naming: { score: 88, weight: 0.1 },
    errors: { score: 72, weight: 0.05 },
    context: { score: 95, weight: 0.05 },
  }

  it('AC1: fixture com TODAS as dimensões saudáveis (>=70) → [] (nenhum gap → priority omitida)', () => {
    expect(buildDimensionGaps(healthy)).toEqual([])
    // e o chain completo: [] → calculateParetoPriority([]) → [] → envelope omite priority
    expect(calculateParetoPriority(buildDimensionGaps(healthy))).toEqual([])
  })

  it('uma dimensão abaixo do threshold (errors=60) → 1 gap com gap=10, só ela', () => {
    const gaps = buildDimensionGaps({ ...healthy, errors: { score: 60, weight: 0.05 } })
    expect(gaps).toHaveLength(1)
    expect(gaps[0].dimension).toBe('errors')
    expect(gaps[0].gap).toBe(10)
  })

  it('threshold customizável: com threshold=80, dimensões entre 72 e 79 viram gaps', () => {
    const gaps = buildDimensionGaps(healthy, 80)
    const dims = gaps.map((g) => g.dimension).sort()
    expect(dims).toEqual(['docs', 'errors']) // 75 e 72 ficam abaixo de 80
  })
})
