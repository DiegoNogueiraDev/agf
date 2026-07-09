import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  recommendForSnapshot,
  memoryHealth,
  HeapTelemetry,
  HEAP_HIGH_MB,
  RSS_HIGH_MB,
  TELEMETRY_INTERVAL_MS,
} from '../core/observability/heap-telemetry.js'
import type { MemorySnapshot } from '../core/observability/heap-telemetry.js'

function makeSnap(overrides: Partial<MemorySnapshot> = {}): MemorySnapshot {
  return { heapMB: 100, externalMB: 10, rssMB: 200, ts: Date.now(), ...overrides }
}

describe('constants', () => {
  it('HEAP_HIGH_MB is 500', () => {
    expect(HEAP_HIGH_MB).toBe(500)
  })

  it('RSS_HIGH_MB is 1024', () => {
    expect(RSS_HIGH_MB).toBe(1024)
  })

  it('TELEMETRY_INTERVAL_MS is 30000', () => {
    expect(TELEMETRY_INTERVAL_MS).toBe(30_000)
  })
})

describe('recommendForSnapshot', () => {
  it('returns healthy message for normal snapshot', () => {
    const recs = recommendForSnapshot(makeSnap())
    expect(recs).toContain('memory healthy')
  })

  it('warns when heap exceeds 500MB', () => {
    const recs = recommendForSnapshot(makeSnap({ heapMB: 600 }))
    expect(recs.some((r) => r.includes('heap'))).toBe(true)
  })

  it('warns when RSS exceeds 1024MB', () => {
    const recs = recommendForSnapshot(makeSnap({ rssMB: 1200 }))
    expect(recs.some((r) => r.includes('restart daemon'))).toBe(true)
  })

  it('warns when external exceeds 200MB', () => {
    const recs = recommendForSnapshot(makeSnap({ externalMB: 250 }))
    expect(recs.some((r) => r.includes('external'))).toBe(true)
  })

  it('returns array of strings', () => {
    const recs = recommendForSnapshot(makeSnap())
    expect(Array.isArray(recs)).toBe(true)
    recs.forEach((r) => expect(typeof r).toBe('string'))
  })

  it('returns multiple warnings when multiple thresholds exceeded', () => {
    const recs = recommendForSnapshot(makeSnap({ heapMB: 600, rssMB: 1200, externalMB: 300 }))
    expect(recs.length).toBeGreaterThan(1)
  })
})

describe('memoryHealth', () => {
  it('returns MemoryHealth with recommendations', () => {
    const result = memoryHealth(() => makeSnap())
    expect(result).toHaveProperty('heapMB')
    expect(result).toHaveProperty('rssMB')
    expect(result).toHaveProperty('recommendations')
    expect(Array.isArray(result.recommendations)).toBe(true)
  })

  it('uses provided sampler', () => {
    const sampler = vi.fn(() => makeSnap({ heapMB: 999 }))
    const result = memoryHealth(sampler)
    expect(sampler).toHaveBeenCalledOnce()
    expect(result.heapMB).toBe(999)
  })
})

describe('HeapTelemetry', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts not running', () => {
    const ht = new HeapTelemetry()
    expect(ht.isRunning()).toBe(false)
  })

  it('isRunning true after start', () => {
    vi.useFakeTimers()
    const ht = new HeapTelemetry(
      () => makeSnap(),
      () => {},
      1000,
    )
    ht.start()
    expect(ht.isRunning()).toBe(true)
    ht.stop()
  })

  it('isRunning false after stop', () => {
    vi.useFakeTimers()
    const ht = new HeapTelemetry(
      () => makeSnap(),
      () => {},
      1000,
    )
    ht.start()
    ht.stop()
    expect(ht.isRunning()).toBe(false)
  })

  it('does not restart if already running', () => {
    vi.useFakeTimers()
    const emit = vi.fn()
    const ht = new HeapTelemetry(() => makeSnap(), emit, 100)
    ht.start()
    ht.start()
    vi.advanceTimersByTime(250)
    expect(emit).toHaveBeenCalledTimes(2)
    ht.stop()
  })
})
