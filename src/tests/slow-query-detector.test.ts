/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  checkSlowQuery,
  getSlowQueryThreshold,
  previewSql,
  sanitizeParamTypes,
  DEFAULT_SLOW_QUERY_MS,
} from '../core/store/slow-query-detector.js'

describe('DEFAULT_SLOW_QUERY_MS', () => {
  it('is 500ms', () => {
    expect(DEFAULT_SLOW_QUERY_MS).toBe(500)
  })
})

describe('getSlowQueryThreshold', () => {
  it('returns DEFAULT when env var is not set', () => {
    expect(getSlowQueryThreshold({})).toBe(DEFAULT_SLOW_QUERY_MS)
  })

  it('reads from SQLITE_SLOW_QUERY_MS env var', () => {
    expect(getSlowQueryThreshold({ SQLITE_SLOW_QUERY_MS: '1000' })).toBe(1000)
  })

  it('returns DEFAULT for non-positive values', () => {
    expect(getSlowQueryThreshold({ SQLITE_SLOW_QUERY_MS: '0' })).toBe(DEFAULT_SLOW_QUERY_MS)
    expect(getSlowQueryThreshold({ SQLITE_SLOW_QUERY_MS: '-100' })).toBe(DEFAULT_SLOW_QUERY_MS)
  })

  it('returns DEFAULT for NaN values', () => {
    expect(getSlowQueryThreshold({ SQLITE_SLOW_QUERY_MS: 'not-a-number' })).toBe(DEFAULT_SLOW_QUERY_MS)
  })
})

describe('sanitizeParamTypes', () => {
  it('returns empty array for undefined params', () => {
    expect(sanitizeParamTypes(undefined)).toEqual([])
  })

  it('maps null to "null"', () => {
    expect(sanitizeParamTypes([null])).toEqual(['null'])
  })

  it('maps Date to "Date"', () => {
    expect(sanitizeParamTypes([new Date('2024-01-01')])).toEqual(['Date'])
  })

  it('maps arrays to "array"', () => {
    expect(sanitizeParamTypes([[1, 2, 3]])).toEqual(['array'])
  })

  it('maps Buffer to "Buffer"', () => {
    expect(sanitizeParamTypes([Buffer.from('hello')])).toEqual(['Buffer'])
  })

  it('maps primitives to typeof strings', () => {
    expect(sanitizeParamTypes(['hello', 42, true])).toEqual(['string', 'number', 'boolean'])
  })

  it('handles mixed param types', () => {
    expect(sanitizeParamTypes([null, 'text', 123, true, undefined])).toEqual([
      'null',
      'string',
      'number',
      'boolean',
      'undefined',
    ])
  })
})

describe('previewSql', () => {
  it('collapses whitespace and trims', () => {
    expect(previewSql('  SELECT   *  FROM  nodes  ')).toBe('SELECT * FROM nodes')
  })

  it('truncates long SQL with ellipsis', () => {
    const longSql = 'SELECT ' + 'a, '.repeat(100) + ' FROM large_table'
    const result = previewSql(longSql, 50)
    expect(result).toHaveLength(50)
    expect(result.endsWith('...')).toBe(true)
  })

  it('returns full SQL when under maxChars', () => {
    const sql = 'SELECT id FROM nodes'
    expect(previewSql(sql, 200)).toBe(sql)
  })

  it('uses default maxChars=200', () => {
    const sql = 'SELECT 1'
    expect(previewSql(sql)).toBe('SELECT 1')
  })
})

describe('checkSlowQuery', () => {
  it('returns slow=false when duration <= threshold', () => {
    const report = checkSlowQuery({ sql: 'SELECT 1', durationMs: 100, thresholdMs: 500 })
    expect(report.slow).toBe(false)
    expect(report.thresholdMs).toBe(500)
    expect(report.durationMs).toBe(100)
  })

  it('returns slow=true when duration > threshold', () => {
    const report = checkSlowQuery({ sql: 'SELECT * FROM big_table', durationMs: 600, thresholdMs: 500 })
    expect(report.slow).toBe(true)
  })

  it('uses DEFAULT_SLOW_QUERY_MS when no threshold provided', () => {
    const fast = checkSlowQuery({ sql: 'SELECT 1', durationMs: 100 })
    expect(fast.slow).toBe(false)
    const slow = checkSlowQuery({ sql: 'SELECT 1', durationMs: DEFAULT_SLOW_QUERY_MS + 1 })
    expect(slow.slow).toBe(true)
  })

  it('includes sqlPreview and paramTypes in report', () => {
    const report = checkSlowQuery({ sql: 'SELECT * FROM nodes WHERE id = ?', durationMs: 600, params: ['abc'] })
    expect(report.sqlPreview).toContain('SELECT * FROM nodes')
    expect(report.paramTypes).toEqual(['string'])
  })

  it('returns paramTypes as empty array when params omitted', () => {
    const report = checkSlowQuery({ sql: 'SELECT 1', durationMs: 600 })
    expect(report.paramTypes).toEqual([])
  })
})
