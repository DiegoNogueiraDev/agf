/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * B4 — Interval-loop core. Deterministic & offline: inject sleep/now/runOnce.
 */

import { describe, it, expect, vi } from 'vitest'
import { runIntervalLoop, parseDuration } from '../core/autonomy/interval-loop.js'

describe('parseDuration', () => {
  it('parses ms / s / m / h suffixes', () => {
    expect(parseDuration('500ms')).toBe(500)
    expect(parseDuration('30s')).toBe(30_000)
    expect(parseDuration('5m')).toBe(300_000)
    expect(parseDuration('2h')).toBe(7_200_000)
  })

  it('treats a bare number as milliseconds', () => {
    expect(parseDuration('250')).toBe(250)
  })

  it('throws on garbage input', () => {
    expect(() => parseDuration('soon')).toThrow()
    expect(() => parseDuration('')).toThrow()
    expect(() => parseDuration('-5s')).toThrow()
  })
})

describe('runIntervalLoop', () => {
  it('stops with max_runs after exactly maxRuns invocations', async () => {
    const sleep = vi.fn(async () => {})
    const runOnce = vi.fn(async () => {})
    const result = await runIntervalLoop({
      everyMs: 1000,
      maxRuns: 3,
      runOnce,
      sleep,
      now: () => 0,
    })
    expect(result).toEqual({ runs: 3, stopped: 'max_runs' })
    expect(runOnce).toHaveBeenCalledTimes(3)
    // sleeps BETWEEN runs only (2 sleeps for 3 runs)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('stops with timeout when wall-clock budget elapses before the next run', async () => {
    const sleep = vi.fn(async () => {})
    const runOnce = vi.fn(async () => {})
    // clock advances 600ms per read; budget 1000ms.
    let t = 0
    const now = (): number => {
      const cur = t
      t += 600
      return cur
    }
    const result = await runIntervalLoop({
      everyMs: 100,
      maxTotalMs: 1000,
      runOnce,
      sleep,
      now,
    })
    expect(result.stopped).toBe('timeout')
    expect(result.runs).toBeGreaterThanOrEqual(1)
  })

  it('stops with aborted when the signal flips', async () => {
    const signal = { aborted: false }
    const runOnce = vi.fn(async (run: number) => {
      if (run >= 2) signal.aborted = true
    })
    const result = await runIntervalLoop({
      everyMs: 100,
      maxRuns: 10,
      signal,
      runOnce,
      sleep: async () => {},
      now: () => 0,
    })
    expect(result.stopped).toBe('aborted')
    expect(result.runs).toBe(2)
  })

  it('defaults to a single run when no bound is provided (never loops forever)', async () => {
    const runOnce = vi.fn(async () => {})
    const result = await runIntervalLoop({
      everyMs: 100,
      runOnce,
      sleep: async () => {},
      now: () => 0,
    })
    expect(result).toEqual({ runs: 1, stopped: 'max_runs' })
    expect(runOnce).toHaveBeenCalledTimes(1)
  })

  it('runs immediately (run 1) before the first sleep', async () => {
    const calls: string[] = []
    await runIntervalLoop({
      everyMs: 100,
      maxRuns: 2,
      runOnce: async (run) => {
        calls.push(`run${run}`)
      },
      sleep: async () => {
        calls.push('sleep')
      },
      now: () => 0,
    })
    expect(calls).toEqual(['run1', 'sleep', 'run2'])
  })
})
