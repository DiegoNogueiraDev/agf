/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { appendSessionEvent, listSessionEvents, listSessionEventsSince } from '../core/session/session-event-store.js'

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

describe('session-event-store', () => {
  it('appends events and lists them newest-first with parsed payload', () => {
    const db = freshDb()
    try {
      appendSessionEvent(db, { channel: 'session:mode-changed', timestamp: 't1', payload: { from: 'a' } })
      appendSessionEvent(db, { channel: 'session:message-update', timestamp: 't2', payload: { n: 2 } })
      const out = listSessionEvents(db)
      expect(out).toHaveLength(2)
      expect(out[0].channel).toBe('session:message-update')
      expect(out[0].payload).toEqual({ n: 2 })
    } finally {
      db.close()
    }
  })

  it('returns empty when there are no events', () => {
    const db = freshDb()
    try {
      expect(listSessionEvents(db)).toEqual([])
    } finally {
      db.close()
    }
  })

  it('respects the limit option', () => {
    const db = freshDb()
    try {
      for (const t of ['a', 'b', 'c'])
        appendSessionEvent(db, { channel: 'session:message-update', timestamp: t, payload: {} })
      expect(listSessionEvents(db, { limit: 2 })).toHaveLength(2)
    } finally {
      db.close()
    }
  })
})

describe('listSessionEventsSince', () => {
  it('returns all events chronologically with their id when afterId is 0', () => {
    const db = freshDb()
    try {
      appendSessionEvent(db, { channel: 'session:message-update', timestamp: 't1', payload: {} })
      appendSessionEvent(db, { channel: 'session:mode-changed', timestamp: 't2', payload: {} })
      const out = listSessionEventsSince(db, 0)
      expect(out.map((e) => e.channel)).toEqual(['session:message-update', 'session:mode-changed'])
      expect(out[0].id).toBeLessThan(out[1].id)
    } finally {
      db.close()
    }
  })

  it('returns only events newer than the cursor', () => {
    const db = freshDb()
    try {
      appendSessionEvent(db, { channel: 'session:message-update', timestamp: 't1', payload: {} })
      const first = listSessionEventsSince(db, 0)
      appendSessionEvent(db, { channel: 'session:mode-changed', timestamp: 't2', payload: {} })
      const fresh = listSessionEventsSince(db, first[0].id)
      expect(fresh).toHaveLength(1)
      expect(fresh[0].channel).toBe('session:mode-changed')
    } finally {
      db.close()
    }
  })

  it('returns empty when there are no newer events', () => {
    const db = freshDb()
    try {
      expect(listSessionEventsSince(db, 0)).toEqual([])
    } finally {
      db.close()
    }
  })

  it('respects the limit', () => {
    const db = freshDb()
    try {
      for (const t of ['a', 'b', 'c']) appendSessionEvent(db, { channel: 'x', timestamp: t, payload: {} })
      expect(listSessionEventsSince(db, 0, 2)).toHaveLength(2)
    } finally {
      db.close()
    }
  })
})
