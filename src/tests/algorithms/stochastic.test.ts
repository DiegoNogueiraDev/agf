import { describe, it, expect } from 'vitest'
import {
  factorial,
  monteCarlo,
  bayesianInference,
  markovChain,
  littlesLaw,
  mm1Queue,
  kalmanFilter,
  linearRegression,
  chiSquareTest,
  shannonEntropy,
  quickselect,
  cumulativeFlowDiagram,
  seasonalityDecompose,
} from '../../core/algorithms/stochastic.js'

describe('monteCarlo', () => {
  it('constant function returns deterministic results', () => {
    const result = monteCarlo(100, () => 42)
    expect(result.mean).toBe(42)
    expect(result.median).toBe(42)
    expect(result.p75).toBe(42)
    expect(result.p85).toBe(42)
    expect(result.p95).toBe(42)
    expect(result.stddev).toBe(0)
    expect(result.distribution).toHaveLength(100)
  })

  it('distribution is sorted ascending', () => {
    const result = monteCarlo(50, (t) => 100 - t)
    for (let i = 1; i < result.distribution.length; i++) {
      expect(result.distribution[i]).toBeGreaterThanOrEqual(result.distribution[i - 1])
    }
  })

  it('mean of identity function', () => {
    const result = monteCarlo(10, (t) => t + 1)
    expect(result.mean).toBeCloseTo(5.5, 1)
  })
})

describe('bayesianInference', () => {
  it('computes posterior correctly', () => {
    const result = bayesianInference(0.5, 0.9, 0.45)
    expect(result.posterior).toBeCloseTo(1, 5)
    expect(result.prior).toBe(0.5)
    expect(result.evidence).toBe(0.45)
  })

  it('posterior equals prior when likelihood equals evidence', () => {
    const result = bayesianInference(0.3, 0.5, 0.5)
    expect(result.posterior).toBe(0.3)
  })
})

describe('markovChain', () => {
  const tm = [
    [0.7, 0.3],
    [0.4, 0.6],
  ]
  const init = [1, 0]

  it('returns correct number of steps', () => {
    const result = markovChain(tm, init, 5)
    expect(result.probabilities).toHaveLength(6)
    expect(result.probabilities[0]).toEqual([1, 0])
  })

  it('probabilities sum to 1 at each step', () => {
    const result = markovChain(tm, init, 10)
    for (const p of result.probabilities) {
      expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
    }
  })

  it('steady state converges', () => {
    const result = markovChain(tm, init, 100)
    expect(result.steadyState[0]).toBeGreaterThan(0)
    expect(result.steadyState[1]).toBeGreaterThan(0)
    expect(result.steadyState[0] + result.steadyState[1]).toBeCloseTo(1, 5)
  })
})

describe('littlesLaw', () => {
  it('M/M/1 waiting time', () => {
    const result = littlesLaw(8, 10)
    expect(result.avgWait).toBeCloseTo(0.5, 5)
    expect(result.utilization).toBe(0.8)
  })

  it('M/M/1 queue length', () => {
    const result = littlesLaw(8, 10)
    expect(result.avgQueueLength).toBeCloseTo(3.2, 4)
  })

  it('M/M/c with multiple servers reduces wait', () => {
    const single = littlesLaw(8, 10, 1)
    const multi = littlesLaw(8, 10, 2)
    expect(multi.utilization).toBe(0.4)
    expect(multi.avgWait).toBeLessThan(single.avgWait)
  })

  it('throughput equals arrival rate in stable system', () => {
    const result = littlesLaw(5, 10)
    expect(result.throughput).toBe(5)
  })
})

describe('mm1Queue', () => {
  it('steady-state metrics for M/M/1', () => {
    const result = mm1Queue(6, 10)
    expect(result.utilization).toBe(0.6)
    expect(result.idleFraction).toBe(0.4)
    expect(result.avgQueueLength).toBeCloseTo(0.9, 5)
    expect(result.avgWait).toBeCloseTo(0.25, 5)
  })

  it('idle fraction is 1 - utilization', () => {
    const result = mm1Queue(3, 4)
    expect(result.idleFraction).toBeCloseTo(1 - result.utilization, 5)
  })
})

describe('kalmanFilter', () => {
  it('filters constant measurements', () => {
    const measurements = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
    const result = kalmanFilter(measurements)
    expect(result.filtered).toHaveLength(10)
    expect(result.variance).toHaveLength(10)
    expect(result.gain).toHaveLength(10)
    const last = result.filtered[result.filtered.length - 1]
    expect(last).toBeGreaterThan(4.5)
    expect(last).toBeLessThan(5.5)
  })

  it('gain decreases with more measurements', () => {
    const measurements = [10, 10.5, 9.8, 10.2, 9.9]
    const result = kalmanFilter(measurements, { R: 0.1, Q: 1 })
    expect(result.gain[0]).toBeGreaterThanOrEqual(result.gain[result.gain.length - 1])
  })

  it('variance decreases as filter converges', () => {
    const measurements = [1, 1.1, 0.9, 1, 1.05]
    const result = kalmanFilter(measurements)
    expect(result.variance[0]).toBeGreaterThanOrEqual(result.variance[result.variance.length - 1])
  })
})

describe('linearRegression', () => {
  const data: [number, number][] = [
    [0, 1],
    [1, 3],
    [2, 5],
    [3, 7],
    [4, 9],
    [5, 11],
  ]

  it('slope and intercept', () => {
    const result = linearRegression(data)
    expect(result.slope).toBeCloseTo(2, 5)
    expect(result.intercept).toBeCloseTo(1, 5)
  })

  it('R² = 1 for perfect linear data', () => {
    const result = linearRegression(data)
    expect(result.rSquared).toBeCloseTo(1, 5)
  })

  it('predict function', () => {
    const result = linearRegression(data)
    expect(result.predict(6)).toBeCloseTo(13, 5)
    expect(result.predict(-1)).toBeCloseTo(-1, 5)
  })
})

describe('chiSquareTest', () => {
  it('perfect match gives p-value 1', () => {
    const observed = [10, 20, 30]
    const expected = [10, 20, 30]
    const result = chiSquareTest(observed, expected)
    expect(result.chiSquared).toBe(0)
    expect(result.pValue).toBe(1)
    expect(result.degreesOfFreedom).toBe(2)
  })

  it('non-trivial chi-square', () => {
    const observed = [15, 15, 30]
    const expected = [10, 20, 30]
    const result = chiSquareTest(observed, expected)
    expect(result.chiSquared).toBeCloseTo(3.75, 4)
    expect(result.degreesOfFreedom).toBe(2)
    expect(result.pValue).toBeGreaterThan(0.1)
    expect(result.pValue).toBeLessThan(0.2)
  })

  it('different lengths throw', () => {
    expect(() => chiSquareTest([1, 2], [1, 2, 3])).toThrow()
  })
})

describe('shannonEntropy', () => {
  it('uniform distribution', () => {
    const probs = [0.25, 0.25, 0.25, 0.25]
    expect(shannonEntropy(probs)).toBeCloseTo(2, 5)
  })

  it('certain event has zero entropy', () => {
    expect(shannonEntropy([1])).toBe(0)
  })

  it('zero probabilities do not affect entropy', () => {
    const probs = [0.5, 0.5, 0, 0]
    expect(shannonEntropy(probs)).toBeCloseTo(1, 5)
  })

  it('handles partial probabilities without normalizing', () => {
    const result = shannonEntropy([0.5, 0.5])
    expect(result).toBeCloseTo(1, 5)
  })
})

describe('quickselect', () => {
  it('finds k-th smallest element', () => {
    const arr = [3, 1, 4, 1, 5, 9, 2, 6]
    expect(quickselect(arr, 0)).toBe(1)
    expect(quickselect(arr, 1)).toBe(1)
    expect(quickselect(arr, 2)).toBe(2)
    expect(quickselect(arr, 3)).toBe(3)
    expect(quickselect(arr, 4)).toBe(4)
    expect(quickselect(arr, 5)).toBe(5)
    expect(quickselect(arr, 6)).toBe(6)
    expect(quickselect(arr, 7)).toBe(9)
  })

  it('does not mutate input array', () => {
    const arr = [5, 3, 1]
    const copy = [...arr]
    quickselect(arr, 1)
    expect(arr).toEqual(copy)
  })

  it('single element', () => {
    expect(quickselect([42], 0)).toBe(42)
  })
})

describe('cumulativeFlowDiagram', () => {
  it('accumulates counts over time', () => {
    const history = [
      { date: '2024-01-01', backlog: 3, inProgress: 2, done: 1 },
      { date: '2024-01-02', backlog: 1, inProgress: 1, done: 2 },
      { date: '2024-01-03', backlog: 0, inProgress: 1, done: 3 },
    ]
    const result = cumulativeFlowDiagram(history)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ date: '2024-01-01', backlog: 3, inProgress: 2, done: 1 })
    expect(result[1]).toEqual({ date: '2024-01-02', backlog: 4, inProgress: 3, done: 3 })
    expect(result[2]).toEqual({ date: '2024-01-03', backlog: 4, inProgress: 4, done: 6 })
  })

  it('handles empty array', () => {
    expect(cumulativeFlowDiagram([])).toEqual([])
  })

  it('handles missing fields', () => {
    const history = [{ date: '2024-01-01', backlog: 1 }, { date: '2024-01-02' }]
    const result = cumulativeFlowDiagram(history)
    expect(result[1].backlog).toBe(1)
    expect(result[1].inProgress).toBe(0)
    expect(result[1].done).toBe(0)
  })
})

describe('seasonalityDecompose', () => {
  const n = 48
  const period = 12
  const timeSeries: number[] = []
  for (let i = 0; i < n; i++) {
    timeSeries.push(10 + 2 * Math.sin((2 * Math.PI * i) / period) + i * 0.1)
  }

  it('returns arrays of same length', () => {
    const result = seasonalityDecompose(timeSeries, period)
    expect(result.trend).toHaveLength(n)
    expect(result.seasonal).toHaveLength(n)
    expect(result.residual).toHaveLength(n)
  })

  it('residual plus trend plus seasonal equals original', () => {
    const result = seasonalityDecompose(timeSeries, period)
    for (let i = 0; i < n; i++) {
      expect(result.trend[i] + result.seasonal[i] + result.residual[i]).toBeCloseTo(timeSeries[i], 5)
    }
  })

  it('trend is increasing for upward-sloping data', () => {
    const result = seasonalityDecompose(timeSeries, period)
    const mid = Math.floor(n / 2)
    expect(result.trend[mid + 5]).toBeGreaterThan(result.trend[mid - 5])
  })
})

// ── Numerical stability guards (Task 1.6 ACs) ────────────────────────────────

describe('AC1: factorial — RangeError for n > 20 (guards integer overflow)', () => {
  it('factorial(20) succeeds and returns correct value', () => {
    expect(factorial(20)).toBe(2432902008176640000)
  })

  it('factorial(0) = 1 and factorial(1) = 1', () => {
    expect(factorial(0)).toBe(1)
    expect(factorial(1)).toBe(1)
  })

  it('factorial(10) = 3628800', () => {
    expect(factorial(10)).toBe(3628800)
  })

  it('factorial(21) throws RangeError before integer overflow', () => {
    expect(() => factorial(21)).toThrow(RangeError)
    expect(() => factorial(21)).toThrow(/must be ≤ 20/)
  })

  it('factorial(100) throws RangeError (Number.MAX_SAFE_INTEGER exceeded)', () => {
    expect(() => factorial(100)).toThrow(RangeError)
  })
})

describe('AC2: kalmanFilter — RangeError when R = 0 (degenerate measurement noise)', () => {
  it('R = 0 throws RangeError (division by zero in Kalman gain)', () => {
    expect(() => kalmanFilter([1, 2, 3], { R: 0 })).toThrow(RangeError)
    expect(() => kalmanFilter([1, 2, 3], { R: 0 })).toThrow(/R must be positive/)
  })

  it('R = -1 also throws (negative noise is physically nonsensical)', () => {
    expect(() => kalmanFilter([1, 2, 3], { R: -1 })).toThrow(RangeError)
  })

  it('R = 0.001 (small but positive) does not throw and converges', () => {
    const result = kalmanFilter([5, 5, 5, 5, 5], { R: 0.001 })
    expect(result.filtered).toHaveLength(5)
    expect(result.filtered[4]).toBeCloseTo(5, 2)
    expect(isFinite(result.gain[4])).toBe(true)
  })
})

describe('AC3: M/M/c queue with c > 20 — log-space computation avoids NaN', () => {
  it('c = 25 returns finite, positive wait times (no NaN from factorial overflow)', () => {
    const result = littlesLaw(20, 1, 25)
    expect(isFinite(result.avgWait)).toBe(true)
    expect(isFinite(result.avgQueueLength)).toBe(true)
    expect(result.avgWait).toBeGreaterThan(0)
    expect(result.utilization).toBeCloseTo(20 / 25, 5)
  })

  it('c = 50 returns finite results (c > 20 log-space path)', () => {
    const result = littlesLaw(40, 1, 50)
    expect(isFinite(result.avgWait)).toBe(true)
    expect(isNaN(result.avgQueueLength)).toBe(false)
    expect(result.utilization).toBeCloseTo(40 / 50, 5)
  })

  it('c = 21 log-space result is consistent with c = 20 linear trend', () => {
    const r20 = littlesLaw(15, 1, 20)
    const r21 = littlesLaw(15, 1, 21)
    // More servers → shorter wait (monotone)
    expect(r21.avgWait).toBeLessThanOrEqual(r20.avgWait)
    expect(isFinite(r21.avgWait)).toBe(true)
  })
})

describe('AC4: quickselect — O(n) on sorted arrays (random pivot prevents worst-case)', () => {
  it('finds minimum (k=0) in large sorted array correctly', () => {
    const n = 10000
    const sorted = Array.from({ length: n }, (_, i) => i)
    expect(quickselect(sorted, 0)).toBe(0)
  })

  it('finds maximum (k=n-1) in large sorted array correctly', () => {
    const n = 10000
    const sorted = Array.from({ length: n }, (_, i) => i)
    expect(quickselect(sorted, n - 1)).toBe(n - 1)
  })

  it('finds median in large sorted array and completes quickly', () => {
    const n = 50000
    const sorted = Array.from({ length: n }, (_, i) => i)
    const start = performance.now()
    const median = quickselect(sorted, Math.floor(n / 2))
    const elapsed = performance.now() - start
    expect(median).toBe(Math.floor(n / 2))
    // O(n) on 50000 should be << 2000ms; O(n²) would be 2.5 billion ops
    expect(elapsed).toBeLessThan(2000)
  })

  it('does not mutate the sorted input array', () => {
    const sorted = [0, 1, 2, 3, 4]
    quickselect(sorted, 2)
    expect(sorted).toEqual([0, 1, 2, 3, 4])
  })
})
