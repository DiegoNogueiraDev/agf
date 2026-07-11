/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { HelperRecordStore, resolveKnownFix } from '../core/autonomy/helper-record-store.js'

const NOW = 1_700_000_000_000

describe('resolveKnownFix (helper-record lookup before retry — T3.3)', () => {
  // AC: GIVEN a known failure signature WHEN it recurs THEN the stored fix is applied without re-diagnosing
  it('returns the known fix and marks it used for a known signature', () => {
    const db = new Database(':memory:')
    const store = new HelperRecordStore(db)
    store.put({ signature: 'element_obscured', fix: { action: 'scroll_into_view' }, createdAt: 1 })

    const res = resolveKnownFix(store, 'element_obscured', NOW)
    expect(res.known).toBe(true)
    expect(res.fix).toEqual({ action: 'scroll_into_view' })
    expect(store.get('element_obscured')?.lastUsedAt).toBe(NOW)
  })

  // AC: GIVEN an unknown signature WHEN it occurs THEN it falls into the normal diagnosis flow
  it('reports not-known for an unseen signature (fall through to diagnosis)', () => {
    const store = new HelperRecordStore(new Database(':memory:'))
    const res = resolveKnownFix(store, 'never_seen', NOW)
    expect(res.known).toBe(false)
    expect(res.fix).toBeNull()
  })
})
