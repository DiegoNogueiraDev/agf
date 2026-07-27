/*!
 * TDD: A/B split stratified + seeded random (node_baee8803e96f).
 *
 * AC1: Given samples, When calibrate splits A/B, Then assignment is randomized
 *      and stratified by a confound.
 * AC2: Given a seed, When runs in test, Then assignment is deterministic (reproducible).
 */

import { describe, it, expect } from 'vitest'
import { abSplitStratified, type AbSplitResult } from '../core/algorithms/stats/ab-split-stratified.js'

const SAMPLES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

describe('AC1: randomized and stratified assignment', () => {
  it('splits samples into two groups of equal size (within 1)', () => {
    const result: AbSplitResult = abSplitStratified(SAMPLES, { seed: 42 })
    const diff = Math.abs(result.groupA.length - result.groupB.length)
    expect(diff).toBeLessThanOrEqual(1)
  })

  it('every sample appears in exactly one group', () => {
    const result = abSplitStratified(SAMPLES, { seed: 42 })
    const all = [...result.groupA, ...result.groupB].sort((a, b) => a - b)
    expect(all).toEqual([...SAMPLES].sort((a, b) => a - b))
  })

  it('assignment differs from naive i%2 split', () => {
    const result = abSplitStratified(SAMPLES, { seed: 99 })
    const naiveA = SAMPLES.filter((_, i) => i % 2 === 0)
    // Not guaranteed but overwhelmingly likely with any reasonable random seed
    expect(result.groupA).not.toEqual(naiveA)
  })
})

describe('AC2: seeded split is deterministic', () => {
  it('same seed produces same groups', () => {
    const r1 = abSplitStratified(SAMPLES, { seed: 7 })
    const r2 = abSplitStratified(SAMPLES, { seed: 7 })
    expect(r1.groupA).toEqual(r2.groupA)
    expect(r1.groupB).toEqual(r2.groupB)
  })

  it('different seeds produce different groups', () => {
    const r1 = abSplitStratified(SAMPLES, { seed: 1 })
    const r2 = abSplitStratified(SAMPLES, { seed: 2 })
    expect(r1.groupA).not.toEqual(r2.groupA)
  })
})
