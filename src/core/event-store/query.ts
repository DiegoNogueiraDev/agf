/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-unified-observability — Task 1.3: typed query API for event store.
 */

import type Database from 'better-sqlite3'

export interface EventRow {
  id: string
  kind: string
  subjectRef_kind: string
  subjectRef_id: string
  sessionId: string | null
  timestamp: string
  durationMs: number | null
  parentEventId: string | null
  payload: string | null
  projectId: string | null
}

function pct(sorted: number[], p: number): number {
  const rank = p * sorted.length - 1
  const lo = Math.max(0, Math.floor(rank))
  const hi = Math.min(Math.ceil(rank), sorted.length - 1)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §fix-ci-lint
  return Math.round(sorted[lo]! + (rank - lo) * (sorted[hi]! - sorted[lo]!))
}

export interface EventMetrics {
  count: number
  p50: number
  p95: number
}

/** Fetch recent events for a session, newest first, up to a limit. */
export function getEventsBySession(db: Database.Database, sessionId: string, limit: number): EventRow[] {
  return db
    .prepare('SELECT * FROM events WHERE sessionId = ? ORDER BY timestamp ASC LIMIT ?')
    .all(sessionId, limit) as EventRow[]
}

/** Fetch events for a given subject kind and id. */
export function getEventsBySubject(db: Database.Database, kind: string, id: string): EventRow[] {
  return db
    .prepare('SELECT * FROM events WHERE subjectRef_kind = ? AND subjectRef_id = ? ORDER BY timestamp ASC')
    .all(kind, id) as EventRow[]
}

/** Aggregate event metrics for a kind within a trailing time window. */
export function getMetrics(db: Database.Database, kind: string, windowMs: number): EventMetrics {
  const since = new Date(Date.now() - windowMs).toISOString()
  const rows = db
    .prepare(
      'SELECT durationMs FROM events WHERE kind = ? AND timestamp >= ? AND durationMs IS NOT NULL ORDER BY durationMs ASC',
    )
    .all(kind, since) as Array<{ durationMs: number }>

  const count = rows.length
  if (count === 0) return { count: 0, p50: 0, p95: 0 }

  const durations = rows.map((r) => r.durationMs)
  return { count, p50: pct(durations, 0.5), p95: pct(durations, 0.95) }
}

export interface PhaseTransitionMetrics {
  count: number
  avgMs: number
  p50: number
  p95: number
}

/** Compute phase-transition timing metrics from the event log. */
export function getPhaseTransitionMetrics(
  db: Database.Database,
  fromPhase: string,
  toPhase: string,
): PhaseTransitionMetrics {
  // §EPIC-unified-observability — JTBD: single SQL, no multi-table joins
  // Pairs each fromPhase-entry event with the earliest subsequent toPhase-entry
  // event for the same projectId. All within the events table via CTEs.
  const rows = db
    .prepare(
      `WITH enter_events AS (
         SELECT id, timestamp, projectId
         FROM events
         WHERE kind = 'phase.transitioned'
           AND json_extract(payload, '$.to') = ?
       ),
       exit_events AS (
         SELECT id, timestamp, projectId
         FROM events
         WHERE kind = 'phase.transitioned'
           AND json_extract(payload, '$.to') = ?
       ),
       pairs AS (
         SELECT
           CAST(
             (julianday(MIN(ex.timestamp)) - julianday(en.timestamp)) * 86400000
           AS INTEGER) AS durationMs
         FROM enter_events en
         JOIN exit_events ex
           ON ex.timestamp > en.timestamp
           AND (en.projectId IS NULL OR ex.projectId = en.projectId)
         GROUP BY en.id, en.timestamp
       )
       SELECT durationMs FROM pairs WHERE durationMs > 0 ORDER BY durationMs ASC`,
    )
    .all(fromPhase, toPhase) as Array<{ durationMs: number }>

  const count = rows.length
  if (count === 0) return { count: 0, avgMs: 0, p50: 0, p95: 0 }

  const durations = rows.map((r) => r.durationMs)
  const avgMs = Math.round(durations.reduce((a, b) => a + b, 0) / count)
  return { count, avgMs, p50: pct(durations, 0.5), p95: pct(durations, 0.95) }
}

/** Trace the causal chain of events leading to a given event id. */
export function getCausalityChain(db: Database.Database, eventId: string): EventRow[] {
  return db
    .prepare(
      `WITH RECURSIVE chain(id, kind, subjectRef_kind, subjectRef_id, sessionId, timestamp,
          durationMs, parentEventId, payload, projectId) AS (
        SELECT id, kind, subjectRef_kind, subjectRef_id, sessionId, timestamp,
               durationMs, parentEventId, payload, projectId
        FROM events WHERE id = ?
        UNION ALL
        SELECT e.id, e.kind, e.subjectRef_kind, e.subjectRef_id, e.sessionId, e.timestamp,
               e.durationMs, e.parentEventId, e.payload, e.projectId
        FROM events e JOIN chain c ON e.id = c.parentEventId
      )
      SELECT * FROM chain`,
    )
    .all(eventId) as EventRow[]
}
