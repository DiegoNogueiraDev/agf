/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { selectByMarginalValue, type ValueItem } from '../core/context/marginal-value-stop.js'

const item = (gain: number, tokens = 1): ValueItem => ({ gain, tokens })

describe('selectByMarginalValue (optimal-foraging stop rule)', () => {
  it('stops on diminishing returns — keeps only patches richer than the habitat average', () => {
    const out = selectByMarginalValue([item(10), item(8), item(6), item(4), item(2)])
    // habitat mean rate = 30/5 = 6 ⇒ keep gains ≥ 6.
    expect(out.takenIndices).toEqual([0, 1, 2])
  })

  it('keeps everything when all patches are equally rich', () => {
    const out = selectByMarginalValue([item(5), item(5), item(5), item(5)])
    expect(out.takenCount).toBe(4)
  })

  it('stops at a sharp cliff in marginal value', () => {
    const out = selectByMarginalValue([item(10), item(10), item(10), item(1), item(1)])
    expect(out.takenIndices).toEqual([0, 1, 2])
  })

  it('honours minItems even when the first items are below average', () => {
    const out = selectByMarginalValue([item(10), item(1), item(1)], { minItems: 2 })
    expect(out.takenCount).toBeGreaterThanOrEqual(2)
  })

  it('accounts for token cost, not just gain (rate = gain/tokens)', () => {
    // Second item has high gain but huge cost ⇒ low rate ⇒ dropped.
    const out = selectByMarginalValue([item(10, 1), item(12, 100)])
    expect(out.takenIndices).toEqual([0])
  })

  it('handles the empty list', () => {
    expect(selectByMarginalValue([])).toEqual({ takenCount: 0, takenIndices: [] })
  })
})
