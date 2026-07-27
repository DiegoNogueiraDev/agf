/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import { SqliteCachePersistence } from '../core/llm/response-cache-sqlite.js'

describe('SqliteCachePersistence', () => {
  let db: Database.Database
  let cache: SqliteCachePersistence<{ x: number }>

  beforeEach(() => {
    db = new Database(':memory:')
    cache = new SqliteCachePersistence<{ x: number }>(db)
  })

  it('read returns undefined for a missing key', () => {
    expect(cache.read('nonexistent')).toBeUndefined()
  })

  it('write then read returns the stored value', () => {
    const now = Date.now()
    cache.write({ key: 'k1', value: { x: 42 }, schemaVersion: 1, createdAtMs: now, expiresAtMs: now + 60_000 })
    const result = cache.read('k1')
    expect(result).toBeDefined()
    expect(result!.value).toEqual({ x: 42 })
    expect(result!.key).toBe('k1')
  })

  it('read returns undefined for an expired entry and removes it', () => {
    const now = Date.now()
    cache.write({ key: 'expired', value: { x: 1 }, schemaVersion: 1, createdAtMs: now - 2000, expiresAtMs: now - 1000 })
    expect(cache.read('expired')).toBeUndefined()
    // Entry must have been cleaned up (size is 0)
    expect(cache.size()).toBe(0)
  })

  it('prune removes entries whose TTL is before the given timestamp', () => {
    const now = Date.now()
    cache.write({ key: 'old', value: { x: 1 }, schemaVersion: 1, createdAtMs: now - 5000, expiresAtMs: now - 1000 })
    cache.write({ key: 'fresh', value: { x: 2 }, schemaVersion: 1, createdAtMs: now, expiresAtMs: now + 60_000 })
    const removed = cache.prune(now)
    expect(removed).toBe(1)
    expect(cache.size()).toBe(1)
  })
})
