/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for core/utils/slow-query-logger.ts — timedQuery
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { timedQuery, SLOW_QUERY_THRESHOLD_MS } from '../core/utils/slow-query-logger.js'
import { getLogBuffer, clearLogBuffer } from '../core/utils/logger.js'

beforeEach(() => {
  clearLogBuffer()
})

describe('timedQuery', () => {
  it('does not log when query is fast', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const result = timedQuery('SELECT 1', () => 42)
    expect(result).toBe(42)
    const entries = getLogBuffer()
    expect(entries).toHaveLength(0)
    stderrSpy.mockRestore()
  })

  it('logs warning when query exceeds threshold', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    let callTime = 0
    const nowFn = () => {
      callTime++
      return callTime === 1 ? 0 : SLOW_QUERY_THRESHOLD_MS + 100
    }
    const result = timedQuery('SELECT slow', () => 99, { nowFn, thresholdMs: SLOW_QUERY_THRESHOLD_MS })
    expect(result).toBe(99)
    const entries = getLogBuffer()
    expect(entries).toHaveLength(1)
    expect(entries[0].level).toBe('warn')
    expect(entries[0].message).toBe('slow_query')
    expect(entries[0].context?.durationMs).toBe(SLOW_QUERY_THRESHOLD_MS + 100)
    expect(entries[0].context?.sql).toBe('SELECT slow')
    stderrSpy.mockRestore()
  })

  it('uses custom thresholdMs', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    let callTime = 0
    const nowFn = () => {
      callTime++
      return callTime === 1 ? 0 : 10
    }
    const result = timedQuery('SELECT fast', () => 'ok', { nowFn, thresholdMs: 5 })
    expect(result).toBe('ok')
    const entries = getLogBuffer()
    expect(entries).toHaveLength(1)
    stderrSpy.mockRestore()
  })

  it('does not log when under custom threshold', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    let callTime = 0
    const nowFn = () => {
      callTime++
      return callTime === 1 ? 0 : 10
    }
    timedQuery('SELECT fast', () => 'ok', { nowFn, thresholdMs: 100 })
    const entries = getLogBuffer()
    expect(entries).toHaveLength(0)
    stderrSpy.mockRestore()
  })

  it('re-throws errors from fn', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    expect(() =>
      timedQuery('SELECT broken', () => {
        throw new Error('db error')
      }),
    ).toThrow('db error')
    stderrSpy.mockRestore()
  })

  it('re-throws and does not create log entry on throw', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    expect(() =>
      timedQuery('SELECT broken', () => {
        throw new Error('fail')
      }),
    ).toThrow()
    const entries = getLogBuffer()
    const slowEntries = entries.filter((e) => e.message === 'slow_query')
    expect(slowEntries).toHaveLength(0)
    stderrSpy.mockRestore()
  })

  it('truncates long SQL in log', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const longSql = 'SELECT ' + 'x'.repeat(500)
    let callTime = 0
    const nowFn = () => {
      callTime++
      return callTime === 1 ? 0 : 1000
    }
    timedQuery(longSql, () => null, { nowFn })
    const entries = getLogBuffer()
    expect(entries[0].context?.sql).toHaveLength(200)
    stderrSpy.mockRestore()
  })

  it('uses Date.now by default', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const result = timedQuery('SELECT 1', () => 'ok')
    expect(result).toBe('ok')
    stderrSpy.mockRestore()
  })
})
