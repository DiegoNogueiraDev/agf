/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { recordTestReceipt, testReceiptExists } from '../core/runner/test-receipt-store.js'

describe('test-receipt-store', () => {
  let store: SqliteStore
  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject()
  })
  afterEach(() => store?.close())

  it('testReceiptExists is false for an unknown receipt', () => {
    expect(testReceiptExists(store.getDb(), 'deadbeef')).toBe(false)
  })

  it('records a receipt and then finds it', () => {
    recordTestReceipt(store.getDb(), { receipt: 'abc123', nodeId: 'n1', runner: 'pytest', exitCode: 0, passed: true })
    expect(testReceiptExists(store.getDb(), 'abc123')).toBe(true)
  })

  it('is idempotent on the same receipt (PK conflict ignored)', () => {
    const e = { receipt: 'dup', nodeId: 'n1', runner: 'go', exitCode: 0, passed: true }
    recordTestReceipt(store.getDb(), e)
    expect(() => recordTestReceipt(store.getDb(), e)).not.toThrow()
    expect(testReceiptExists(store.getDb(), 'dup')).toBe(true)
  })

  it('only counts passing receipts as valid evidence', () => {
    recordTestReceipt(store.getDb(), { receipt: 'failrun', nodeId: 'n2', runner: 'vitest', exitCode: 1, passed: false })
    expect(testReceiptExists(store.getDb(), 'failrun')).toBe(false)
  })
})
