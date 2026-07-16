import { describe, it, expect } from 'vitest'
import { factorial, quickselect, littlesLaw, mm1Queue, shannonEntropy } from '../core/algorithms/stochastic.js'

describe('factorial', () => {
  it('returns 1 for 0', () => {
    expect(factorial(0)).toBe(1)
  })

  it('returns 1 for 1', () => {
    expect(factorial(1)).toBe(1)
  })

  it('returns 120 for 5', () => {
    expect(factorial(5)).toBe(120)
  })

  it('returns 3628800 for 10', () => {
    expect(factorial(10)).toBe(3628800)
  })

  it('throws RangeError for n > 20', () => {
    expect(() => factorial(21)).toThrow(RangeError)
  })
})

describe('quickselect', () => {
  it('returns the minimum (k=0)', () => {
    expect(quickselect([5, 3, 1, 4, 2], 0)).toBe(1)
  })

  it('returns the maximum (k=n-1)', () => {
    expect(quickselect([5, 3, 1, 4, 2], 4)).toBe(5)
  })

  it('returns median (k=2) of 5 elements', () => {
    expect(quickselect([5, 3, 1, 4, 2], 2)).toBe(3)
  })
})

describe('littlesLaw', () => {
  it('returns an object with avgWait, avgQueueLength, utilization, throughput', () => {
    const result = littlesLaw(2, 4)
    expect(typeof result.avgWait).toBe('number')
    expect(typeof result.utilization).toBe('number')
    expect(typeof result.throughput).toBe('number')
  })

  it('utilization = λ / (c × μ)', () => {
    const result = littlesLaw(2, 4)
    expect(result.utilization).toBeCloseTo(0.5, 5)
  })

  it('returns Infinity avgWait for saturated system (ρ >= 1)', () => {
    const result = littlesLaw(5, 5)
    expect(result.avgWait).toBe(Infinity)
  })
})

describe('mm1Queue', () => {
  it('returns utilization = λ/μ', () => {
    const result = mm1Queue(2, 4)
    expect(result.utilization).toBeCloseTo(0.5, 5)
  })

  it('returns positive avgQueueLength for stable queue', () => {
    const result = mm1Queue(3, 6)
    expect(result.avgQueueLength).toBeGreaterThan(0)
  })

  it('returns Infinity for saturated queue (λ >= μ)', () => {
    const result = mm1Queue(5, 5)
    expect(result.avgQueueLength).toBe(Infinity)
  })
})

describe('shannonEntropy', () => {
  it('returns 0 for certain event [1]', () => {
    expect(shannonEntropy([1])).toBeCloseTo(0, 5)
  })

  it('returns 1 bit for fair coin [0.5, 0.5]', () => {
    expect(shannonEntropy([0.5, 0.5])).toBeCloseTo(1, 5)
  })

  it('returns 2 bits for uniform 4-outcome [0.25×4]', () => {
    expect(shannonEntropy([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(2, 5)
  })

  it('skips p=0 entries without NaN', () => {
    expect(shannonEntropy([0, 0.5, 0.5])).toBeCloseTo(1, 5)
  })
})
