/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { HookStatsStore } from '../core/hooks/hook-stats-store.js'

function createTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hook_handler_stats (
      handler_id    TEXT PRIMARY KEY,
      call_count    INTEGER NOT NULL DEFAULT 0,
      p50_duration  REAL,
      p95_duration  REAL,
      last_error    TEXT,
      circuit_state TEXT NOT NULL DEFAULT 'closed',
      updated_at    TEXT NOT NULL
    )
  `)
}

describe('HookStatsStore', () => {
  let db: Database.Database
  let store: HookStatsStore

  beforeEach(() => {
    db = new Database(':memory:')
    createTable(db)
    store = new HookStatsStore(db)
  })

  afterEach(() => {
    db.close()
  })

  it('record creates a new stats entry', () => {
    store.record('h1', 100)
    const stats = store.get('h1')
    expect(stats).toBeDefined()
    expect(stats!.handlerId).toBe('h1')
    expect(stats!.callCount).toBe(1)
    expect(stats!.p50Duration).toBe(100)
    expect(stats!.p95Duration).toBe(100)
    expect(stats!.lastError).toBeNull()
    expect(stats!.circuitState).toBe('closed')
  })

  it('record updates existing stats with EWMA p50/p95', () => {
    store.record('h1', 100)
    store.record('h1', 200)

    const stats = store.get('h1')
    expect(stats!.callCount).toBe(2)

    // EWMA p50 = 0.7 * 100 + 0.3 * 200 = 130
    expect(stats!.p50Duration).toBeCloseTo(130, 0)

    // EWMA p95 = max(200, 0.95 * 100) = max(200, 95) = 200
    expect(stats!.p95Duration).toBe(200)
  })

  it('record stores error message', () => {
    store.record('h1', 50, 'timeout error')
    const stats = store.get('h1')
    expect(stats!.lastError).toBe('timeout error')
    expect(stats!.callCount).toBe(1)
  })

  it('record preserves last_error when no error provided', () => {
    store.record('h1', 50, 'first error')
    store.record('h1', 30)

    const stats = store.get('h1')
    expect(stats!.lastError).toBe('first error')
    expect(stats!.callCount).toBe(2)
  })

  it('setCircuitState sets circuit state', () => {
    store.setCircuitState('h1', 'open')
    const stats = store.get('h1')
    expect(stats).toBeDefined()
    expect(stats!.circuitState).toBe('open')
  })

  it('setCircuitState updates existing circuit state', () => {
    store.setCircuitState('h1', 'open')
    store.setCircuitState('h1', 'half-open')

    const stats = store.get('h1')
    expect(stats!.circuitState).toBe('half-open')
  })

  it('list returns all entries sorted by callCount DESC', () => {
    store.record('h1', 10)
    store.record('h2', 20)
    store.record('h2', 30)
    store.record('h3', 40)
    store.record('h3', 50)
    store.record('h3', 60)

    const list = store.list()
    expect(list).toHaveLength(3)
    expect(list[0].handlerId).toBe('h3')
    expect(list[1].handlerId).toBe('h2')
    expect(list[2].handlerId).toBe('h1')
  })

  it('get returns null for unknown handler', () => {
    const stats = store.get('nonexistent')
    expect(stats).toBeNull()
  })

  it('list returns empty array when no stats exist', () => {
    expect(store.list()).toEqual([])
  })

  it('record updates p50/p95 with EWMA over multiple calls', () => {
    store.record('h1', 100)
    store.record('h1', 200)
    store.record('h1', 300)

    const stats = store.get('h1')
    expect(stats!.callCount).toBe(3)

    // p50 = 0.7 * (0.7*100 + 0.3*200) + 0.3*300
    const secondP50 = 0.7 * 100 + 0.3 * 200 // = 130
    const thirdP50 = 0.7 * secondP50 + 0.3 * 300 // = 181
    expect(stats!.p50Duration).toBeCloseTo(thirdP50, 0)

    // p95 = max(300, 0.95 * max(200, 0.95 * 100))
    const secondP95 = Math.max(200, 0.95 * 100) // = 200
    const thirdP95 = Math.max(300, 0.95 * secondP95) // = 300
    expect(stats!.p95Duration).toBe(thirdP95)
  })
})
