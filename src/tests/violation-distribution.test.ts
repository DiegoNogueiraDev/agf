/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { distributeViolationsFairly } from '../core/harness/violation-distribution.js'
import type { ViolationDetail } from '../core/harness/violation-detail.js'

const mkViolation = (dimension: string, idx: number): ViolationDetail => ({
  file: `src/core/${dimension}-${idx}.ts`,
  line: 1,
  dimension: dimension as any,
  violationType: 'test',
  evidence: 'evidence',
  confidence: 1.0,
})

describe('distributeViolationsFairly', () => {
  it('returns empty for empty input', () => {
    expect(distributeViolationsFairly([], 100)).toEqual([])
  })

  it('includes all violations when under cap', () => {
    const all = [mkViolation('types', 1), mkViolation('tests', 1)]
    const r = distributeViolationsFairly(all, 100)
    expect(r).toHaveLength(2)
  })

  it('distributes fairly across dimensions', () => {
    // types has 5, tests has 1, naming has 5
    const all = [
      ...Array.from({ length: 5 }, (_, i) => mkViolation('types', i)),
      ...Array.from({ length: 1 }, (_, i) => mkViolation('tests', i)),
      ...Array.from({ length: 5 }, (_, i) => mkViolation('naming', i)),
    ]
    const r = distributeViolationsFairly(all, 6)
    // entries in insertion order: types(5), tests(1), naming(5)
    // sort by count asc (stable): tests(1), types(5), naming(5)
    // Round 1 — tests: equalShare=floor(6/3)=2, take=min(1,2,6)=1, remaining=5, dimsLeft=2
    // Round 2 — types: equalShare=floor(5/2)=2, take=min(5,2,5)=2, remaining=3, dimsLeft=1
    // Round 3 — naming: equalShare=max(1,floor(3/1))=3, take=min(5,3,3)=3, remaining=0
    // total = 1+2+3 = 6
    expect(r).toHaveLength(6)
    const dims = r.map((v) => v.dimension)
    expect(dims.filter((d) => d === 'tests')).toHaveLength(1)
    expect(dims.filter((d) => d === 'types')).toHaveLength(2)
    expect(dims.filter((d) => d === 'naming')).toHaveLength(3)
  })

  it('respects maxPerDimension', () => {
    const all = Array.from({ length: 10 }, (_, i) => mkViolation('types', i))
    const r = distributeViolationsFairly(all, 100, 3)
    expect(r).toHaveLength(3) // capped by maxPerDimension
  })

  it('handles single dimension', () => {
    const all = Array.from({ length: 5 }, (_, i) => mkViolation('types', i))
    const r = distributeViolationsFairly(all, 3)
    expect(r).toHaveLength(3)
    expect(r.every((v) => v.dimension === 'types')).toBe(true)
  })
})
