/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { HookBus } from '../core/hooks/hook-bus.js'
import { GraphEventBus } from '../core/events/event-bus.js'
import { SessionEventLog } from '../core/session/session-event-log.js'
import { listSessionEvents } from '../core/session/session-event-store.js'

function freshBus(): HookBus {
  return new HookBus(new GraphEventBus())
}

describe('SessionEventLog', () => {
  it('records a session:message-update emitted on the bus', async () => {
    const bus = freshBus()
    const logSink = new SessionEventLog()
    logSink.install(bus)
    await bus.emit({ channel: 'session:message-update', timestamp: '2026-01-01T00:00:00Z', payload: { n: 1 } })
    expect(logSink.list()).toHaveLength(1)
    expect(logSink.list()[0].channel).toBe('session:message-update')
  })

  it('returns entries newest-first', async () => {
    const bus = freshBus()
    const logSink = new SessionEventLog()
    logSink.install(bus)
    await bus.emit({ channel: 'session:mode-changed', timestamp: 't1', payload: {} })
    await bus.emit({ channel: 'session:message-update', timestamp: 't2', payload: {} })
    expect(logSink.list()[0].channel).toBe('session:message-update')
  })

  it('persists events to session_events when a db is provided (cross-process)', async () => {
    const bus = freshBus()
    const db = new Database(':memory:')
    configureDb(db)
    runMigrations(db)
    try {
      new SessionEventLog().install(bus, db)
      await bus.emit({ channel: 'session:mode-changed', timestamp: 't1', payload: { to: 'read-only' } })
      const persisted = listSessionEvents(db)
      expect(persisted).toHaveLength(1)
      expect(persisted[0].channel).toBe('session:mode-changed')
    } finally {
      db.close()
    }
  })

  it('enforces the cap by dropping the oldest entry', async () => {
    const bus = freshBus()
    const logSink = new SessionEventLog(2)
    logSink.install(bus)
    for (const t of ['a', 'b', 'c']) {
      await bus.emit({ channel: 'session:message-update', timestamp: t, payload: {} })
    }
    const entries = logSink.list()
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.timestamp)).toEqual(['c', 'b']) // newest-first, oldest 'a' dropped
  })
})
