/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * AUDIT-046 [MED]: CcrStore emits the marker `⟨ccr:HASH⟩` but get() looks up the
 * bare hash, so the wrapped form (what `agf retrieve` receives) fails with
 * NOT_FOUND. Fix: strip a `⟨ccr:…⟩` wrapper inside the core get() — keeping
 * bare-hash lookups working.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { CcrStore, ccrMarker } from '../core/economy/ccr-store.js'

describe('AUDIT-046: CcrStore.get resolves the ⟨ccr:HASH⟩ wrapper', () => {
  let db: Database.Database
  let store: CcrStore

  beforeEach(() => {
    db = new Database(':memory:')
    store = new CcrStore(db)
  })
  afterEach(() => db.close())

  it('retrieves the original by the wrapped marker form', () => {
    const original = 'reversible original payload — 世界'
    const hash = store.put(original)
    expect(store.get(ccrMarker(hash))).toBe(original)
  })

  it('still retrieves by the bare hash (back-compat)', () => {
    const original = 'bare lookup path'
    const hash = store.put(original)
    expect(store.get(hash)).toBe(original)
  })

  it('returns null for an unknown wrapped marker', () => {
    expect(store.get(ccrMarker('deadbeef'))).toBeNull()
  })
})
