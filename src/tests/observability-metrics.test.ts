import { describe, it, expect, beforeEach } from 'vitest'
import {
  createCounter,
  createHistogram,
  getSnapshot,
  resetAll,
  httpRequestsTotal,
  httpErrorsTotal,
} from '../core/observability/metrics.js'

beforeEach(() => {
  resetAll()
})

describe('createCounter', () => {
  it('starts at 0', () => {
    const c = createCounter('test.counter')
    expect(c.get()).toBe(0)
  })

  it('increments by 1', () => {
    const c = createCounter('test.inc')
    c.increment()
    expect(c.get()).toBe(1)
  })

  it('increments by N', () => {
    const c = createCounter('test.incN')
    c.increment(5)
    expect(c.get()).toBe(5)
  })

  it('accumulates across calls', () => {
    const c = createCounter('test.accum')
    c.increment(3)
    c.increment(2)
    expect(c.get()).toBe(5)
  })

  it('decrements', () => {
    const c = createCounter('test.dec')
    c.increment(10)
    c.decrement(3)
    expect(c.get()).toBe(7)
  })

  it('resets to 0', () => {
    const c = createCounter('test.reset')
    c.increment(5)
    c.reset()
    expect(c.get()).toBe(0)
  })
})

describe('createHistogram', () => {
  it('records observations', () => {
    const h = createHistogram('test.hist')
    h.observe(10)
    h.observe(20)
    expect(h.count()).toBe(2)
  })

  it('starts with count 0', () => {
    const h = createHistogram('test.empty')
    expect(h.count()).toBe(0)
  })

  it('computes percentile', () => {
    const h = createHistogram('test.p50')
    h.observe(10)
    h.observe(20)
    h.observe(30)
    const p50 = h.percentile(0.5)
    expect(p50).toBeGreaterThanOrEqual(10)
    expect(p50).toBeLessThanOrEqual(30)
  })

  it('returns 0 percentile for empty histogram', () => {
    const h = createHistogram('test.empty.p')
    expect(h.percentile(0.5)).toBe(0)
  })
})

describe('getSnapshot', () => {
  it('returns object with counters and histograms', () => {
    const snap = getSnapshot()
    expect(typeof snap.counters).toBe('object')
    expect(typeof snap.histograms).toBe('object')
  })

  it('includes registered counters', () => {
    httpRequestsTotal.increment()
    const snap = getSnapshot()
    expect(snap.counters['http.requests.total']).toBeGreaterThan(0)
  })
})

describe('resetAll', () => {
  it('resets counters to 0', () => {
    httpErrorsTotal.increment(5)
    resetAll()
    expect(httpErrorsTotal.get()).toBe(0)
  })
})
