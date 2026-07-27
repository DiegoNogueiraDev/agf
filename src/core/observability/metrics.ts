/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-observability / node_cf608ec0381b
 * In-memory Counter/Histogram registry — RED/USE metrics.
 *
 * All state lives in two module-level Maps so the same instances are shared
 * across the process. Call resetAll() between test runs.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Counter {
  increment(value?: number): void
  decrement(value?: number): void
  get(): number
  reset(): void
}

export interface Histogram {
  observe(value: number): void
  /** Nearest-rank percentile. p=0.5 → median, p=0.95, p=0.99. Returns 0 when empty. */
  percentile(p: number): number
  count(): number
  reset(): void
}

export interface HistogramStats {
  p50: number
  p95: number
  p99: number
  count: number
}

export interface MetricsSnapshot {
  counters: Record<string, number>
  histograms: Record<string, HistogramStats>
}

// ── Registry ──────────────────────────────────────────────────────────────────

const _counters = new Map<string, CounterImpl>()
const _histograms = new Map<string, HistogramImpl>()

class CounterImpl implements Counter {
  private _value = 0
  constructor(readonly name: string) {}
  increment(value = 1): void {
    this._value += value
  }
  decrement(value = 1): void {
    this._value -= value
  }
  get(): number {
    return this._value
  }
  reset(): void {
    this._value = 0
  }
}

class HistogramImpl implements Histogram {
  private _values: number[] = []
  constructor(readonly name: string) {}

  observe(value: number): void {
    this._values.push(value)
  }

  percentile(p: number): number {
    if (this._values.length === 0) return 0
    const sorted = [...this._values].sort((a, b) => a - b)
    // Nearest-rank method (1-based)
    const idx = Math.ceil(p * sorted.length) - 1
    return sorted[Math.max(0, idx)]
  }

  count(): number {
    return this._values.length
  }

  reset(): void {
    this._values = []
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Get or create a named counter (singleton per name). */
export function createCounter(name: string): Counter {
  let c = _counters.get(name)
  if (!c) {
    c = new CounterImpl(name)
    _counters.set(name, c)
  }
  return c
}

/** Get or create a named histogram (singleton per name). */
export function createHistogram(name: string): Histogram {
  let h = _histograms.get(name)
  if (!h) {
    h = new HistogramImpl(name)
    _histograms.set(name, h)
  }
  return h
}

/** Return a snapshot of all registered counters and histogram percentiles. */
export function getSnapshot(): MetricsSnapshot {
  const counters: Record<string, number> = {}
  for (const [name, c] of _counters) counters[name] = c.get()

  const histograms: Record<string, HistogramStats> = {}
  for (const [name, h] of _histograms) {
    histograms[name] = {
      p50: h.percentile(0.5),
      p95: h.percentile(0.95),
      p99: h.percentile(0.99),
      count: h.count(),
    }
  }

  return { counters, histograms }
}

/** Reset all counters and histograms to zero (useful between test runs). */
export function resetAll(): void {
  for (const c of _counters.values()) c.reset()
  for (const h of _histograms.values()) h.reset()
}

// ── Named RED/USE metrics ─────────────────────────────────────────────────────
// RED: rate, errors, duration — USE: utilization, saturation, errors

export const httpRequestsTotal: Counter = createCounter('http.requests.total')
export const httpErrorsTotal: Counter = createCounter('http.errors.total')
export const httpDurationMs: Histogram = createHistogram('http.duration.ms')

export const sqliteConnectionsActive: Counter = createCounter('sqlite.connections.active')
export const eventBusQueueDepth: Counter = createCounter('event_bus.queue.depth')
export const errorsRate: Counter = createCounter('errors.rate')
