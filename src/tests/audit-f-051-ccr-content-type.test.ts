/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * AUDIT-051 [LOW]: CcrStore.put used INSERT OR IGNORE, so a re-put could never
 * backfill an originally-null content_type. Fix: ON CONFLICT(hash) DO UPDATE SET
 * content_type = COALESCE(excluded.content_type, content_type) — backfill a null
 * tag, never clobber an existing one with null. The content itself is
 * content-addressed (sha256) so it is always identical → still byte-safe.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { CcrStore } from '../core/economy/ccr-store.js'

function contentTypeOf(db: Database.Database, hash: string): string | null {
  const row = db.prepare('SELECT content_type FROM ccr_store WHERE hash = ?').get(hash) as
    { content_type: string | null } | undefined
  return row ? row.content_type : null
}

describe('AUDIT-051: re-put backfills a null content_type via COALESCE', () => {
  let db: Database.Database
  let store: CcrStore

  beforeEach(() => {
    db = new Database(':memory:')
    store = new CcrStore(db)
  })
  afterEach(() => db.close())

  it('a later put WITH a content_type backfills the originally-null tag', () => {
    const original = 'payload one'
    const hash = store.put(original) // no type → null
    expect(contentTypeOf(db, hash)).toBeNull()
    store.put(original, 'application/json')
    expect(contentTypeOf(db, hash)).toBe('application/json')
  })

  it('a later put WITHOUT a content_type does not clobber an existing tag', () => {
    const original = 'payload two'
    const hash = store.put(original, 'text/markdown')
    store.put(original) // no type → must keep the existing tag
    expect(contentTypeOf(db, hash)).toBe('text/markdown')
  })

  it('storage stays idempotent (single row, original intact)', () => {
    const original = 'payload three'
    const hash = store.put(original)
    store.put(original, 'x/y')
    const n = (db.prepare('SELECT COUNT(*) AS n FROM ccr_store WHERE hash = ?').get(hash) as { n: number }).n
    expect(n).toBe(1)
    expect(store.get(hash)).toBe(original)
  })
})
