/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * session_events store — persists the harness's upward events (the diagram's
 * HARNESS → storage box) so `agf session events` returns real cross-process
 * history. Function-based DB store mirroring src/core/store/episodic-outcomes-store.ts.
 */

import type Database from 'better-sqlite3'
import type { SessionEventEntry } from './session-event-log.js'

/** An event to persist. `sessionId` is optional (null when unscoped). */
export interface SessionEventInput {
  channel: string
  timestamp: string
  payload: Record<string, unknown>
  sessionId?: string | null
}

export interface SessionEventQuery {
  limit?: number
  sessionId?: string
}

/** Append one event to the session_events table. */
export function appendSessionEvent(db: Database.Database, event: SessionEventInput): void {
  db.prepare(
    `INSERT INTO session_events (channel, timestamp, payload, session_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(event.channel, event.timestamp, JSON.stringify(event.payload), event.sessionId ?? null, Date.now())
}

interface SessionEventRow {
  channel: string
  timestamp: string
  payload: string
}

/** A persisted event plus its row id — used by incremental consumers (cursoring). */
export type SessionEventWithId = SessionEventEntry & { id: number }

interface SessionEventRowWithId extends SessionEventRow {
  id: number
}

/**
 * Incremental feed: events whose id is greater than `afterId`, oldest-first, so
 * a consumer can poll with a cursor and stream only what is new.
 */
export function listSessionEventsSince(db: Database.Database, afterId: number, limit = 100): SessionEventWithId[] {
  const rows = db
    .prepare(`SELECT id, channel, timestamp, payload FROM session_events WHERE id > ? ORDER BY id ASC LIMIT ?`)
    .all(afterId, limit) as SessionEventRowWithId[]
  return rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    timestamp: r.timestamp,
    payload: JSON.parse(r.payload) as Record<string, unknown>,
  }))
}

/** List persisted events newest-first, optionally filtered by session / capped. */
export function listSessionEvents(db: Database.Database, query: SessionEventQuery = {}): SessionEventEntry[] {
  const where = query.sessionId ? 'WHERE session_id = ?' : ''
  const limit = query.limit ?? 100
  const params: Array<string | number> = query.sessionId ? [query.sessionId, limit] : [limit]
  const rows = db
    .prepare(`SELECT channel, timestamp, payload FROM session_events ${where} ORDER BY id DESC LIMIT ?`)
    .all(...params) as SessionEventRow[]
  return rows.map((r) => ({
    channel: r.channel,
    timestamp: r.timestamp,
    payload: JSON.parse(r.payload) as Record<string, unknown>,
  }))
}
