import { describe, it, expect } from 'vitest'
import { linearRegression } from '../core/algorithms/stats/linear-regression.js'

describe('linearRegression', () => {
  it('computes slope and intercept for a perfect line y=2x+1', () => {
    const points = [
      [0, 1],
      [1, 3],
      [2, 5],
      [3, 7],
    ]
    const result = linearRegression(points)
    expect(result.slope).toBeCloseTo(2, 5)
    expect(result.intercept).toBeCloseTo(1, 5)
  })

  it('returns r2=1 for a perfect fit', () => {
    const points = [
      [1, 2],
      [2, 4],
      [3, 6],
    ]
    const result = linearRegression(points)
    expect(result.r2).toBeCloseTo(1, 5)
  })

  it('returns r2 < 1 for imperfect data', () => {
    const points = [
      [1, 1],
      [2, 5],
      [3, 3],
      [4, 7],
    ]
    const result = linearRegression(points)
    expect(result.r2).toBeLessThan(1)
    expect(result.r2).toBeGreaterThan(0)
  })

  it('computes slope=0 for horizontal line', () => {
    const points = [
      [1, 5],
      [2, 5],
      [3, 5],
    ]
    const result = linearRegression(points)
    expect(result.slope).toBeCloseTo(0, 5)
    expect(result.intercept).toBeCloseTo(5, 5)
  })

  it('returns result object with all expected fields', () => {
    const result = linearRegression([
      [0, 0],
      [1, 1],
    ])
    expect(typeof result.slope).toBe('number')
    expect(typeof result.intercept).toBe('number')
    expect(typeof result.r2).toBe('number')
  })
})
