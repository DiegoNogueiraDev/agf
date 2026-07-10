/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §E4.2 — Auto-quarantine after >= N consecutive DoD failures.
 * Zero-LLM. Reads/writes the events table directly (synchronous — no EventWriter buffer).
 */

import type Database from 'better-sqlite3'
import { generateId } from '../utils/id.js'

export interface AutoQuarantineResult {
  count: number
  quarantined: string[]
}

function now(): string {
  return new Date().toISOString()
}

export function recordDodFail(db: Database.Database, nodeId: string, projectId: string): void {
  db.prepare(
    `INSERT INTO events (id, kind, subjectRef_kind, subjectRef_id, timestamp, projectId)
     VALUES (?, 'dod_fail', 'node', ?, ?, ?)`,
  ).run(generateId('evt'), nodeId, now(), projectId)
}

export function recordDodDone(db: Database.Database, nodeId: string, projectId: string): void {
  db.prepare(
    `INSERT INTO events (id, kind, subjectRef_kind, subjectRef_id, timestamp, projectId)
     VALUES (?, 'dod_done', 'node', ?, ?, ?)`,
  ).run(generateId('evt'), nodeId, now(), projectId)
}

export function getConsecutiveDodFailCount(db: Database.Database, nodeId: string): number {
  // Use rowid (insertion order) rather than timestamp — avoids same-millisecond collisions.
  const lastDone = db
    .prepare(
      `SELECT rowid FROM events
       WHERE kind = 'dod_done' AND subjectRef_id = ?
       ORDER BY rowid DESC LIMIT 1`,
    )
    .get(nodeId) as { rowid: number } | undefined

  const cutoffRowid = lastDone?.rowid ?? 0

  const row = db
    .prepare(
      `SELECT COUNT(*) as c FROM events
       WHERE kind = 'dod_fail' AND subjectRef_id = ? AND rowid > ?`,
    )
    .get(nodeId, cutoffRowid) as { c: number }

  return row.c
}

export function autoQuarantineNodes(db: Database.Database, projectId: string, threshold = 5): AutoQuarantineResult {
  const candidates = db
    .prepare(
      `SELECT DISTINCT subjectRef_id as nodeId FROM events
       WHERE kind = 'dod_fail'
       ${projectId ? 'AND projectId = ?' : ''}`,
    )
    .all(...(projectId ? [projectId] : [])) as Array<{ nodeId: string }>

  const quarantined: string[] = []

  for (const { nodeId } of candidates) {
    const count = getConsecutiveDodFailCount(db, nodeId)
    if (count < threshold) continue

    const node = db.prepare(`SELECT status FROM nodes WHERE id = ? AND project_id = ?`).get(nodeId, projectId) as
      { status: string } | undefined

    if (!node || node.status === 'done' || node.status === 'quarantined') continue

    db.prepare(`UPDATE nodes SET status = 'quarantined', updated_at = ? WHERE id = ?`).run(now(), nodeId)
    quarantined.push(nodeId)
  }

  return { count: quarantined.length, quarantined }
}
