import { describe, it, expect } from 'vitest'
import { knapsack01, knapsack01Items } from '../core/algorithms/dp/knapsack.js'

describe('Knapsack 0/1 (DP)', () => {
  it('solves basic knapsack', () => {
    const values = [60, 100, 120]
    const weights = [10, 20, 30]
    const capacity = 50
    expect(knapsack01(values, weights, capacity)).toBe(220)
  })

  it('returns 0 for empty items', () => {
    expect(knapsack01([], [], 10)).toBe(0)
  })

  it('returns 0 for zero capacity', () => {
    expect(knapsack01([60, 100], [10, 20], 0)).toBe(0)
  })

  it('knapsack01Items returns selected indices', () => {
    const items = knapsack01Items([60, 100, 120], [10, 20, 30], 50)
    expect(items.totalValue).toBe(220)
    expect(items.selected).toEqual([1, 2])
  })
})
