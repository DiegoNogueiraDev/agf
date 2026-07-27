/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { CcrStore } from '../core/economy/ccr-store.js'

describe('CcrStore', () => {
  let db: Database.Database
  let store: CcrStore

  beforeEach(() => {
    db = new Database(':memory:')
    store = new CcrStore(db)
  })

  afterEach(() => {
    db.close()
  })

  it('round-trips the original byte-for-byte (Unicode-safe)', () => {
    // arrange
    const original = 'héllo 世界 🌳 — ünïcødé\n\ttab\tand newline'

    // act
    const hash = store.put(original)
    const retrieved = store.get(hash)

    // assert
    expect(retrieved).toBe(original)
  })

  it('returns null for an unknown hash', () => {
    // arrange
    const unknown = 'deadbeef'

    // act
    const retrieved = store.get(unknown)

    // assert
    expect(retrieved).toBeNull()
  })

  it('produces a deterministic sha256 hash of the original', () => {
    // arrange
    const original = 'the quick brown fox'
    const expected = createHash('sha256').update(original, 'utf8').digest('hex')

    // act
    const hashA = store.put(original)
    const hashB = store.put(original)

    // assert
    expect(hashA).toBe(expected)
    expect(hashB).toBe(expected)
    expect(hashA).toHaveLength(64)
  })

  it('is idempotent: same original yields same hash and a single stored row', () => {
    // arrange
    const original = 'cache me twice'

    // act
    const hash1 = store.put(original)
    const hash2 = store.put(original)
    const rowCount = (db.prepare('SELECT COUNT(*) AS n FROM ccr_store WHERE hash = ?').get(hash1) as { n: number }).n

    // assert
    expect(hash1).toBe(hash2)
    expect(rowCount).toBe(1)
    expect(store.get(hash1)).toBe(original)
  })
})
