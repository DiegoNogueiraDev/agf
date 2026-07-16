import { describe, it, expect } from 'vitest'
import { linearRegression } from '../core/algorithms/stats/linear-regression.js'

describe('Linear Regression', () => {
  it('fits line through points', () => {
    const points = [
      [1, 2],
      [2, 4],
      [3, 6],
      [4, 8],
      [5, 10],
    ]
    const result = linearRegression(points)
    expect(result.slope).toBeCloseTo(2, 1)
    expect(result.intercept).toBeCloseTo(0, 1)
    expect(result.r2).toBeGreaterThan(0.9)
  })
})
