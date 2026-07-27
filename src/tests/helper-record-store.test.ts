/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { HelperRecordStore } from '../core/autonomy/helper-record-store.js'

describe('HelperRecordStore', () => {
  it('creates the helper_records table on open and is idempotent', () => {
    const db = new Database(':memory:')
    new HelperRecordStore(db)
    expect(() => new HelperRecordStore(db)).not.toThrow()
    const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='helper_records'").get()
    expect(exists).toBeTruthy()
  })

  // AC: GIVEN a fix applied WHEN persisted THEN a helper-record with failure signature + fix is written
  it('persists a helper record keyed by failure signature', () => {
    const store = new HelperRecordStore(new Database(':memory:'))
    store.put({ signature: 'element_obscured', fix: { action: 'scroll_into_view' }, createdAt: 1000 })
    const rec = store.get('element_obscured')
    expect(rec).not.toBeNull()
    expect(rec?.fix).toEqual({ action: 'scroll_into_view' })
    expect(rec?.uses).toBe(1)
  })

  // AC: GIVEN the same fix persisted twice WHEN read THEN no duplicate (upsert by signature)
  it('upserts by signature — one row, uses incremented, latest fix kept', () => {
    const db = new Database(':memory:')
    const store = new HelperRecordStore(db)
    store.put({ signature: 'sig', fix: { v: 1 }, createdAt: 1 })
    store.put({ signature: 'sig', fix: { v: 2 }, createdAt: 2 })
    const count = (db.prepare('SELECT COUNT(*) AS n FROM helper_records').get() as { n: number }).n
    expect(count).toBe(1)
    const rec = store.get('sig')
    expect(rec?.uses).toBe(2)
    expect(rec?.fix).toEqual({ v: 2 })
  })

  it('returns null for an unknown signature', () => {
    const store = new HelperRecordStore(new Database(':memory:'))
    expect(store.get('nope')).toBeNull()
  })

  it('scopes records by projectId', () => {
    const db = new Database(':memory:')
    const a = new HelperRecordStore(db, 'projA')
    const b = new HelperRecordStore(db, 'projB')
    a.put({ signature: 's', fix: { p: 'a' }, createdAt: 1 })
    b.put({ signature: 's', fix: { p: 'b' }, createdAt: 1 })
    expect(a.get('s')?.fix).toEqual({ p: 'a' })
    expect(b.get('s')?.fix).toEqual({ p: 'b' })
  })
})
