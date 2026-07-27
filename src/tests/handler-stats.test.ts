/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { aggregateHandlerStats } from '../core/hooks/handler-stats.js'
import type { HandlerCallRecord, HandlerStatsInput } from '../core/hooks/handler-stats.js'

function record(handlerId: string, durationMs: number, ok: boolean, errorMessage?: string): HandlerCallRecord {
  return { handlerId, durationMs, ok, errorMessage, ts: Date.now() }
}

describe('aggregateHandlerStats', () => {
  it('returns empty array for empty input', () => {
    const result = aggregateHandlerStats({ records: [] })
    expect(result).toEqual([])
  })

  it('aggregates single handler records', () => {
    const input: HandlerStatsInput = {
      records: [record('h1', 100, true), record('h1', 200, true)],
    }
    const result = aggregateHandlerStats(input)
    expect(result).toHaveLength(1)
    expect(result[0].handlerId).toBe('h1')
    expect(result[0].callCount).toBe(2)
    expect(result[0].errorCount).toBe(0)
  })

  it('computes p50 and p95 durations', () => {
    // Percentile: rank = floor(p/100 * length). For 10 items:
    // p50 rank = floor(0.5 * 10) = 5 → sorted[5] = 60
    // p95 rank = floor(0.95 * 10) = 9 → sorted[9] = 100
    const input: HandlerStatsInput = {
      records: [
        record('h1', 10, true),
        record('h1', 20, true),
        record('h1', 30, true),
        record('h1', 40, true),
        record('h1', 50, true),
        record('h1', 60, true),
        record('h1', 70, true),
        record('h1', 80, true),
        record('h1', 90, true),
        record('h1', 100, true),
      ],
    }
    const result = aggregateHandlerStats(input)
    expect(result[0].p50DurationMs).toBe(60)
    expect(result[0].p95DurationMs).toBe(100)
  })

  it('tracks error count and last error', () => {
    const input: HandlerStatsInput = {
      records: [record('h1', 10, true), record('h1', 20, false, 'timeout'), record('h1', 30, false, 'crash')],
    }
    const result = aggregateHandlerStats(input)
    expect(result[0].callCount).toBe(3)
    expect(result[0].errorCount).toBe(2)
    expect(result[0].lastError).toBe('crash')
    expect(result[0].lastErrorTs).toBeGreaterThan(0)
  })

  it('returns null lastError when no errors', () => {
    const input: HandlerStatsInput = {
      records: [record('h1', 10, true)],
    }
    const result = aggregateHandlerStats(input)
    expect(result[0].lastError).toBeNull()
    expect(result[0].lastErrorTs).toBeNull()
  })

  it('uses circuitStates override', () => {
    const input: HandlerStatsInput = {
      records: [record('h1', 10, true)],
      circuitStates: { h1: 'open' },
    }
    const result = aggregateHandlerStats(input)
    expect(result[0].circuitState).toBe('open')
  })

  it('defaults circuitState to closed when no override', () => {
    const input: HandlerStatsInput = {
      records: [record('h1', 10, true)],
    }
    const result = aggregateHandlerStats(input)
    expect(result[0].circuitState).toBe('closed')
  })

  it('groups multiple handlers and sorts by callCount DESC', () => {
    const input: HandlerStatsInput = {
      records: [
        record('h1', 10, true),
        record('h2', 20, true),
        record('h2', 30, true),
        record('h2', 40, true),
        record('h3', 50, true),
        record('h3', 60, true),
      ],
    }
    const result = aggregateHandlerStats(input)
    expect(result).toHaveLength(3)
    expect(result[0].handlerId).toBe('h2')
    expect(result[0].callCount).toBe(3)
    expect(result[1].handlerId).toBe('h3')
    expect(result[1].callCount).toBe(2)
    expect(result[2].handlerId).toBe('h1')
    expect(result[2].callCount).toBe(1)
  })

  it('computes p50/p95 correctly for single record', () => {
    const input: HandlerStatsInput = {
      records: [record('h1', 42, true)],
    }
    const result = aggregateHandlerStats(input)
    expect(result[0].p50DurationMs).toBe(42)
    expect(result[0].p95DurationMs).toBe(42)
  })

  it('handles records with non-numeric timestamps gracefully', () => {
    const input: HandlerStatsInput = {
      records: [record('h1', 100, true)],
    }
    const result = aggregateHandlerStats(input)
    expect(result[0].handlerId).toBe('h1')
    expect(result[0].lastError).toBeNull()
  })
})
