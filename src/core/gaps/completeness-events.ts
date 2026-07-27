/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * M10 — completeness timeline (activates the dormant event-store). Each full
 * `agf gaps` run records a `gaps_snapshot` event; `agf gaps --history` reads the
 * timeline back. Best-effort and zero-token: recording never breaks `agf gaps`.
 * This is the "measurable lever" the dormant-modules doc asks for.
 */

import type Database from 'better-sqlite3'
import { EventWriter } from '../event-store/writer.js'
import { getEventsBySubject } from '../event-store/query.js'
import type { GapReport } from './gap-types.js'

const GAPS_SNAPSHOT_KIND = 'gaps_snapshot'
const SUBJECT_KIND = 'completeness'
const SUBJECT_ID = 'gaps'

export interface GapsSnapshot {
  timestamp: string
  score: number
  grade: string
  ready: boolean
  total: number
  required: number
  byKind: Record<string, number>
}

/** Record a point-in-time completeness snapshot to the event-store. Best-effort. */
export async function recordGapsSnapshot(db: Database.Database, report: GapReport): Promise<void> {
  const required = report.gaps.filter((g) => g.severity === 'required').length
  const writer = new EventWriter(db)
  writer.emit({
    kind: GAPS_SNAPSHOT_KIND,
    subjectRef: { kind: SUBJECT_KIND, id: SUBJECT_ID },
    payload: {
      score: report.score,
      grade: report.grade,
      ready: report.ready,
      total: report.gaps.length,
      required,
      byKind: report.byKind,
    },
    timestamp: new Date().toISOString(),
  })
  await writer.close() // flushes the buffered event
}

function safeParse(s: string | null): Record<string, unknown> {
  if (!s) return {}
  try {
    return JSON.parse(s) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Read the completeness timeline (snapshots oldest→newest, capped to `limit`). */
export function getGapsHistory(db: Database.Database, limit = 50): GapsSnapshot[] {
  const rows = getEventsBySubject(db, SUBJECT_KIND, SUBJECT_ID).filter((r) => r.kind === GAPS_SNAPSHOT_KIND)
  const snaps = rows.map((r): GapsSnapshot => {
    const p = safeParse(r.payload)
    return {
      timestamp: r.timestamp,
      score: typeof p.score === 'number' ? p.score : 0,
      grade: typeof p.grade === 'string' ? p.grade : '?',
      ready: p.ready === true,
      total: typeof p.total === 'number' ? p.total : 0,
      required: typeof p.required === 'number' ? p.required : 0,
      byKind: (p.byKind as Record<string, number>) ?? {},
    }
  })
  return snaps.slice(-limit)
}

/** Render the completeness timeline as human text (oldest→newest + Δ). Pure. */
export function formatGapsHistory(snaps: GapsSnapshot[]): string {
  if (snaps.length === 0) {
    return 'Completude — sem histórico ainda (rode `agf gaps` para registrar um snapshot)'
  }
  const lines = [`Completude — timeline (${snaps.length} snapshot(s)):`]
  for (const s of snaps) {
    lines.push(
      `  ${s.timestamp}  score ${String(s.score).padStart(3)}  ${s.grade}  total ${s.total} (req ${s.required})`,
    )
  }
  if (snaps.length >= 2) {
    const first = snaps[0]
    const last = snaps[snaps.length - 1]
    const d = last.score - first.score
    lines.push(`  Δ score: ${d >= 0 ? '+' : ''}${d}  (${first.total} → ${last.total} lacunas)`)
  }
  return lines.join('\n')
}
