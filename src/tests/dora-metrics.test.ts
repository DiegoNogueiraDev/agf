import { describe, it, expect } from 'vitest'
import { percentile } from '../core/insights/dora-metrics.js'

describe('percentile', () => {
  it('returns 0 for empty array', () => {
    expect(percentile([], 0.5)).toBe(0)
  })

  it('returns the single element for single-element array', () => {
    expect(percentile([42], 0.5)).toBe(42)
  })

  it('returns first value for p=0', () => {
    const sorted = [1, 2, 3, 4, 5]
    expect(percentile(sorted, 0)).toBe(1)
  })

  it('returns last value for p=1', () => {
    const sorted = [1, 2, 3, 4, 5]
    expect(percentile(sorted, 1)).toBe(5)
  })

  it('returns median (p=0.5) for odd-length array', () => {
    const sorted = [1, 2, 3, 4, 5]
    expect(percentile(sorted, 0.5)).toBe(3)
  })

  it('returns a value in range for p=0.95', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const p95 = percentile(sorted, 0.95)
    expect(p95).toBeGreaterThanOrEqual(9)
    expect(p95).toBeLessThanOrEqual(10)
  })

  it('filters non-finite values', () => {
    const values = [1, Infinity, 3, NaN, 5]
    const result = percentile(values, 0.5)
    expect(Number.isFinite(result)).toBe(true)
  })

  it('handles all-equal values', () => {
    const sorted = [7, 7, 7, 7]
    expect(percentile(sorted, 0.5)).toBe(7)
  })

  it('clamps p > 1 to 1 (returns max)', () => {
    const sorted = [1, 2, 3]
    expect(percentile(sorted, 2)).toBe(3)
  })
})
