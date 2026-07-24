/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { HookHandlersStore } from '../core/hooks/hook-handlers-store.js'
import type { HookHandlerConfig, HookHandlerKind } from '../core/hooks/config-loader.js'
import type { HookChannel } from '../core/hooks/hook-types.js'

function createTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hook_handlers (
      id            TEXT PRIMARY KEY,
      channel       TEXT NOT NULL,
      kind          TEXT NOT NULL,
      command       TEXT,
      command_args  TEXT,
      env           TEXT,
      timeout_ms    INTEGER NOT NULL DEFAULT 5000,
      priority      INTEGER NOT NULL DEFAULT 0,
      enabled       INTEGER NOT NULL DEFAULT 1,
      description   TEXT,
      origin        TEXT NOT NULL DEFAULT 'runtime',
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hook_handlers_channel ON hook_handlers(channel);
    CREATE INDEX IF NOT EXISTS idx_hook_handlers_origin  ON hook_handlers(origin);
  `)
}

describe('HookHandlersStore', () => {
  let db: Database.Database
  let store: HookHandlersStore

  beforeEach(() => {
    db = new Database(':memory:')
    createTable(db)
    store = new HookHandlersStore(db)
  })

  afterEach(() => {
    db.close()
  })

  it('upsert inserts a new handler', () => {
    store.upsert({
      id: 'h1',
      channel: 'session:start' as HookChannel,
      kind: 'shell' as HookHandlerKind,
      command: '/bin/echo',
      description: 'test handler',
    })

    const list = store.list()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('h1')
    expect(list[0].channel).toBe('session:start')
    expect(list[0].kind).toBe('shell')
    expect(list[0].origin).toBe('runtime')
  })

  it('upsert updates an existing handler', () => {
    store.upsert({ id: 'h1', channel: 'session:start', kind: 'shell', command: '/bin/echo' })
    store.upsert({ id: 'h1', channel: 'tool:pre-call', kind: 'shell', command: '/bin/check', priority: 10 })

    const list = store.list()
    expect(list).toHaveLength(1)
    expect(list[0].channel).toBe('tool:pre-call')
    expect(list[0].command).toBe('/bin/check')
    expect(list[0].priority).toBe(10)
  })

  it('delete removes a handler', () => {
    store.upsert({ id: 'h1', channel: 'session:start', kind: 'shell' })
    store.upsert({ id: 'h2', channel: 'session:start', kind: 'shell' })
    store.delete('h1')

    const list = store.list()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('h2')
  })

  it('delete on unknown id does not throw', () => {
    expect(() => store.delete('nonexistent')).not.toThrow()
  })

  it('list returns only enabled handlers sorted by priority ASC', () => {
    store.upsert({ id: 'h1', channel: 'session:start', kind: 'shell', priority: 10, enabled: true })
    store.upsert({ id: 'h2', channel: 'session:start', kind: 'shell', priority: 5, enabled: true })
    store.upsert({ id: 'h3', channel: 'session:start', kind: 'shell', priority: 0, enabled: false })

    const list = store.list()
    expect(list).toHaveLength(2)
    expect(list[0].id).toBe('h2')
    expect(list[1].id).toBe('h1')
  })

  it('list returns empty array when no handlers', () => {
    expect(store.list()).toEqual([])
  })

  it('stores and retrieves optional commandArgs and env as JSON', () => {
    store.upsert({
      id: 'h-args',
      channel: 'session:start',
      kind: 'shell',
      commandArgs: ['--verbose', '--output=json'],
      env: { PATH: '/usr/bin', DEBUG: '1' },
    })

    const list = store.list()
    expect(list).toHaveLength(1)
    expect(list[0].commandArgs).toEqual(['--verbose', '--output=json'])
    expect(list[0].env).toEqual({ PATH: '/usr/bin', DEBUG: '1' })
  })

  it('stores with custom origin', () => {
    store.upsert({
      id: 'h-origin',
      channel: 'session:start',
      kind: 'shell',
      origin: 'config',
    })

    const list = store.list()
    expect(list[0].origin).toBe('config')
  })

  it('converts enabled: false to 0 and back', () => {
    store.upsert({ id: 'h-disabled', channel: 'session:start', kind: 'shell', enabled: false })

    const list = store.list()
    expect(list).toHaveLength(0) // excluded from list()

    // Check raw row
    const row = db.prepare('SELECT enabled FROM hook_handlers WHERE id = ?').get('h-disabled') as { enabled: number }
    expect(row.enabled).toBe(0)
  })
})
