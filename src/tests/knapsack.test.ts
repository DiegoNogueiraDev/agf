import { describe, it, expect } from 'vitest'
import { knapsack01, knapsack01Items } from '../core/algorithms/dp/knapsack.js'

describe('knapsack01 (returns max value)', () => {
  it('returns 0 for empty items', () => {
    expect(knapsack01([], [], 10)).toBe(0)
  })

  it('returns 0 for capacity 0', () => {
    expect(knapsack01([4, 6], [3, 5], 0)).toBe(0)
  })

  it('returns max value for classic 0/1 knapsack', () => {
    // items: value=[4,6,7], weight=[3,4,5], capacity=7
    // best: item0(4)+item1(6)=10 (weight=7) or item2(7)(weight=5)
    // Optimal: item0+item1 = 10 (w=7 ≤ 7)
    const result = knapsack01([4, 6, 7], [3, 4, 5], 7)
    expect(result).toBe(10)
  })
})

describe('knapsack01Items (returns selected items)', () => {
  it('returns empty selected when capacity is 0', () => {
    const result = knapsack01Items([10], [5], 0)
    expect(result.selected).toEqual([])
    expect(result.totalValue).toBe(0)
  })

  it('selects items that maximize value within capacity', () => {
    const result = knapsack01Items([4, 6, 7], [3, 4, 5], 7)
    expect(result.totalValue).toBe(10)
    expect(Array.isArray(result.selected)).toBe(true)
  })
})
