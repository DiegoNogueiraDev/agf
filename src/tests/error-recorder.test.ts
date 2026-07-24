/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for core/utils/error-recorder.ts — hashError, recordError, getErrorPattern
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { hashError, recordError, getErrorPattern } from '../core/utils/error-recorder.js'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE error_patterns (
      id TEXT PRIMARY KEY,
      error_hash TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      message TEXT,
      count INTEGER NOT NULL DEFAULT 1,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL
    )
  `)
})

afterEach(() => {
  db.close()
})

describe('hashError', () => {
  it('produces stable 16-char hex hash', () => {
    const h1 = hashError('something went wrong')
    const h2 = hashError('something went wrong')
    expect(h1).toBe(h2)
    expect(h1).toHaveLength(16)
    expect(/^[0-9a-f]{16}$/.test(h1)).toBe(true)
  })

  it('normalizes hex addresses', () => {
    const withHex = hashError('error at 0x7ffee3a0a1bc')
    const withoutHex = hashError('error at 0xHEX')
    expect(withHex).toBe(withoutHex)
  })

  it('normalizes large numbers', () => {
    const withNum = hashError('timeout after 12345 ms')
    const withoutNum = hashError('timeout after N ms')
    expect(withNum).toBe(withoutNum)
  })

  it('is case-insensitive', () => {
    expect(hashError('ERROR')).toBe(hashError('error'))
  })

  it('trims whitespace', () => {
    expect(hashError('  hello  ')).toBe(hashError('hello'))
  })
})

describe('recordError', () => {
  it('inserts a new pattern on first occurrence', () => {
    const result = recordError(db, new Error('rate limit: 429'))
    expect(result.count).toBe(1)
    expect(result.category).toBe('rate_limit')
    expect(result.errorHash).toHaveLength(16)
    expect(result.firstSeen).toEqual(result.lastSeen)
  })

  it('increments count on repeated occurrence', () => {
    recordError(db, new Error('SQLITE_BUSY'))
    const result = recordError(db, new Error('SQLITE_BUSY'))
    expect(result.count).toBe(2)
    expect(result.firstSeen).toBeDefined()
    expect(result.lastSeen).toBeDefined()
    expect(result.lastSeen >= result.firstSeen!).toBe(true)
  })

  it('classifies non-Error thrown values', () => {
    const result = recordError(db, 'raw string error')
    expect(result.count).toBe(1)
    expect(result.category).toBe('general')
  })

  it('classifies null', () => {
    const result = recordError(db, null)
    expect(result.count).toBe(1)
    expect(result.category).toBe('general')
  })

  it('uses message slice for very long messages', () => {
    const longMsg = 'x'.repeat(1000)
    const result = recordError(db, new Error(longMsg))
    expect(result.count).toBe(1)
  })
})

describe('getErrorPattern', () => {
  it('returns pattern for existing hash', () => {
    recordError(db, new Error('timeout'))
    const hash = hashError('timeout')
    const pattern = getErrorPattern(db, hash)
    expect(pattern).toBeDefined()
    expect(pattern!.category).toBe('timeout')
    expect(pattern!.count).toBe(1)
  })

  it('returns undefined for unknown hash', () => {
    const pattern = getErrorPattern(db, 'nonexistent')
    expect(pattern).toBeUndefined()
  })

  it('returns updated count after multiple records', () => {
    recordError(db, new Error('ECONNREFUSED'))
    recordError(db, new Error('ECONNREFUSED'))
    recordError(db, new Error('ECONNREFUSED'))
    const hash = hashError('ECONNREFUSED')
    const pattern = getErrorPattern(db, hash)
    expect(pattern!.count).toBe(3)
  })
})
