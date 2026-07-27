import { describe, it, expect, afterEach } from 'vitest'
import {
  createCounter,
  createHistogram,
  getSnapshot,
  resetAll,
  httpRequestsTotal,
  httpErrorsTotal,
  httpDurationMs,
} from '../core/observability/metrics.js'

afterEach(() => {
  resetAll()
})

describe('createCounter', () => {
  it('starts at zero', () => {
    const c = createCounter('test.zero')
    expect(c.get()).toBe(0)
  })

  it('increments by 1 by default', () => {
    const c = createCounter('test.inc1')
    c.increment()
    expect(c.get()).toBe(1)
  })

  it('increments by custom value', () => {
    const c = createCounter('test.incN')
    c.increment(5)
    expect(c.get()).toBe(5)
  })

  it('decrements', () => {
    const c = createCounter('test.dec')
    c.increment(10)
    c.decrement(3)
    expect(c.get()).toBe(7)
  })

  it('resets to zero', () => {
    const c = createCounter('test.reset')
    c.increment(99)
    c.reset()
    expect(c.get()).toBe(0)
  })

  it('returns the same instance for the same name', () => {
    const a = createCounter('test.singleton')
    const b = createCounter('test.singleton')
    a.increment()
    expect(b.get()).toBe(1)
  })
})

describe('createHistogram', () => {
  it('count is 0 initially', () => {
    const h = createHistogram('hist.zero')
    expect(h.count()).toBe(0)
  })

  it('count grows with observations', () => {
    const h = createHistogram('hist.count')
    h.observe(10)
    h.observe(20)
    expect(h.count()).toBe(2)
  })

  it('percentile returns 0 when no observations', () => {
    const h = createHistogram('hist.empty.pct')
    expect(h.percentile(0.5)).toBe(0)
  })

  it('percentile(0.5) is median', () => {
    const h = createHistogram('hist.median')
    h.observe(1)
    h.observe(2)
    h.observe(3)
    expect(h.percentile(0.5)).toBe(2)
  })

  it('percentile(1.0) is max', () => {
    const h = createHistogram('hist.max')
    h.observe(5)
    h.observe(10)
    h.observe(15)
    expect(h.percentile(1.0)).toBe(15)
  })

  it('reset clears observations', () => {
    const h = createHistogram('hist.clear')
    h.observe(42)
    h.reset()
    expect(h.count()).toBe(0)
    expect(h.percentile(0.5)).toBe(0)
  })
})

describe('getSnapshot', () => {
  it('includes counter values', () => {
    const c = createCounter('snap.counter')
    c.increment(7)
    const snap = getSnapshot()
    expect(snap.counters['snap.counter']).toBe(7)
  })

  it('includes histogram stats with p50, p95, p99, count', () => {
    const h = createHistogram('snap.hist')
    for (let i = 1; i <= 100; i++) h.observe(i)
    const snap = getSnapshot()
    const stats = snap.histograms['snap.hist']
    expect(stats.count).toBe(100)
    expect(stats.p50).toBeGreaterThan(0)
    expect(stats.p95).toBeGreaterThanOrEqual(stats.p50)
    expect(stats.p99).toBeGreaterThanOrEqual(stats.p95)
  })
})

describe('resetAll', () => {
  it('resets all registered counters', () => {
    const c = createCounter('global.reset.c')
    c.increment(50)
    resetAll()
    expect(c.get()).toBe(0)
  })

  it('resets all registered histograms', () => {
    const h = createHistogram('global.reset.h')
    h.observe(99)
    resetAll()
    expect(h.count()).toBe(0)
  })
})

describe('named RED/USE metrics', () => {
  it('httpRequestsTotal is a Counter', () => {
    httpRequestsTotal.increment()
    expect(httpRequestsTotal.get()).toBeGreaterThan(0)
  })

  it('httpErrorsTotal is a Counter', () => {
    httpErrorsTotal.increment(2)
    expect(httpErrorsTotal.get()).toBeGreaterThanOrEqual(2)
  })

  it('httpDurationMs is a Histogram', () => {
    httpDurationMs.observe(150)
    expect(httpDurationMs.count()).toBeGreaterThan(0)
  })
})
