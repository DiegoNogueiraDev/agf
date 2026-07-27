/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/event-store/query.ts — getEventsBySession / getEventsBySubject / getMetrics.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { getEventsBySession, getEventsBySubject, getMetrics } from '../core/event-store/query.js'

function db(): Database.Database {
  const d = new Database(':memory:')
  d.exec(`CREATE TABLE events (
    eventId TEXT, sessionId TEXT, kind TEXT,
    subjectRef_kind TEXT, subjectRef_id TEXT,
    timestamp TEXT, durationMs INTEGER, parentEventId TEXT, payload TEXT, projectId TEXT
  )`)
  return d
}

function insert(d: Database.Database, row: Record<string, unknown>): void {
  d.prepare(
    `INSERT INTO events (eventId, sessionId, kind, subjectRef_kind, subjectRef_id, timestamp, durationMs)
     VALUES (@eventId, @sessionId, @kind, @subjectRef_kind, @subjectRef_id, @timestamp, @durationMs)`,
  ).run({
    eventId: null,
    sessionId: null,
    kind: null,
    subjectRef_kind: null,
    subjectRef_id: null,
    timestamp: null,
    durationMs: null,
    ...row,
  })
}

describe('event-store query', () => {
  it('getEventsBySession returns session events ordered by timestamp', () => {
    const d = db()
    insert(d, { eventId: 'e1', sessionId: 's1', timestamp: '2026-01-01T00:00:01Z' })
    insert(d, { eventId: 'e2', sessionId: 's1', timestamp: '2026-01-01T00:00:02Z' })
    insert(d, { eventId: 'e3', sessionId: 's2', timestamp: '2026-01-01T00:00:03Z' })

    const rows = getEventsBySession(d, 's1', 10)
    expect(rows.map((r) => r.eventId)).toEqual(['e1', 'e2'])
  })

  it('getEventsBySubject filters by subject kind + id', () => {
    const d = db()
    insert(d, { eventId: 'e1', subjectRef_kind: 'task', subjectRef_id: 'n1', timestamp: 'a' })
    insert(d, { eventId: 'e2', subjectRef_kind: 'task', subjectRef_id: 'n2', timestamp: 'b' })

    const rows = getEventsBySubject(d, 'task', 'n1')
    expect(rows).toHaveLength(1)
    expect(rows[0].eventId).toBe('e1')
  })

  it('getMetrics returns zeros for an empty window and percentiles otherwise', () => {
    const d = db()
    expect(getMetrics(d, 'toolcall', 60_000)).toEqual({ count: 0, p50: 0, p95: 0 })

    const now = new Date().toISOString()
    for (const ms of [10, 20, 30]) insert(d, { kind: 'toolcall', timestamp: now, durationMs: ms })

    const m = getMetrics(d, 'toolcall', 60_000)
    expect(m.count).toBe(3)
    expect(m.p95).toBeGreaterThanOrEqual(m.p50)
    expect(m.p50).toBeGreaterThan(0)
  })
})
