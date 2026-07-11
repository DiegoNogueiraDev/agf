/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_6be342262dbf — epistemic-mix: tier distribution + low-maturity flag over
 * a set of nodes. Pure computation feeding harness/provenance views.
 * Ported from graph-flow/core/provenance/epistemic-mix.ts.
 */
import { describe, it, expect } from 'vitest'
import {
  computeTierDistribution,
  groupNodesByTier,
  isLowMaturityEpic,
  type TierNode,
} from '../core/provenance/epistemic-mix.js'

function n(id: string, tier: TierNode['tier']): TierNode {
  return { id, title: id, tier }
}

describe('epistemic-mix (#node_6be342262dbf)', () => {
  it('computes counts and percentages', () => {
    const dist = computeTierDistribution([n('a', 'claim'), n('b', 'claim'), n('c', 'proven'), n('d', 'validated')])
    expect(dist.total).toBe(4)
    expect(dist.claim).toBe(2)
    expect(dist.claimPct).toBe(50)
    expect(dist.provenPct).toBe(25)
  })

  it('returns zero percentages on an empty set (no division by zero)', () => {
    const dist = computeTierDistribution([])
    expect(dist.total).toBe(0)
    expect(dist.claimPct).toBe(0)
    expect(dist.provenPct).toBe(0)
  })

  it('groups nodes by tier', () => {
    const groups = groupNodesByTier([n('a', 'claim'), n('b', 'proven'), n('c', 'claim')])
    expect(groups.claim.map((x) => x.id)).toEqual(['a', 'c'])
    expect(groups.proven.map((x) => x.id)).toEqual(['b'])
    expect(groups.validated).toEqual([])
  })

  it('flags low-maturity when more than 50% are claims', () => {
    expect(isLowMaturityEpic(computeTierDistribution([n('a', 'claim'), n('b', 'claim'), n('c', 'proven')]))).toBe(true)
    expect(isLowMaturityEpic(computeTierDistribution([n('a', 'claim'), n('b', 'proven')]))).toBe(false)
    expect(isLowMaturityEpic(computeTierDistribution([]))).toBe(false)
  })
})
