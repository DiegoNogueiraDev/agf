/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * feedback-loop — explicit feedback channel for wrong predictions.
 * Records corrections (query + wrong prediction + correction) and
 * surfaces them via substring search so future agents avoid past mistakes.
 *
 * WHY: closing the learning loop requires storing what went wrong and
 * making it retrievable at decision time (ACT-R interference avoidance).
 * REUSE: SQLite via better-sqlite3 (no new stores); integrates with the
 * existing learning:feedback hook channel in sqlite-learning-store.ts.
 *
 * Pure SQL — no I/O beyond the injected db handle.
 */

import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'

export interface FeedbackRecord {
  query: string
  wrongPrediction: string
  correction: string
  context?: string
}

export interface StoredFeedbackRecord extends FeedbackRecord {
  id: string
  ts: string
}

export interface FeedbackStore {
  record(r: FeedbackRecord): string
  list(): StoredFeedbackRecord[]
  search(query: string, limit?: number): StoredFeedbackRecord[]
}

const DDL = `
  CREATE TABLE IF NOT EXISTS prediction_feedback (
    id          TEXT PRIMARY KEY,
    ts          TEXT NOT NULL,
    query       TEXT NOT NULL,
    wrong       TEXT NOT NULL,
    correction  TEXT NOT NULL,
    context     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_pred_feedback_ts ON prediction_feedback(ts);
`

/** Create (and auto-migrate) a feedback store backed by the given db handle. */
export function createFeedbackStore(db: Database.Database): FeedbackStore {
  db.exec(DDL)

  return {
    record(r: FeedbackRecord): string {
      const id = `fb_${randomUUID().replace(/-/g, '').slice(0, 20)}`
      db.prepare(
        `INSERT INTO prediction_feedback (id, ts, query, wrong, correction, context)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, new Date().toISOString(), r.query, r.wrongPrediction, r.correction, r.context ?? null)
      return id
    },

    list(): StoredFeedbackRecord[] {
      return db
        .prepare(
          `SELECT id, ts, query, wrong AS wrongPrediction, correction, context FROM prediction_feedback ORDER BY ts DESC`,
        )
        .all() as StoredFeedbackRecord[]
    },

    search(query: string, limit = 10): StoredFeedbackRecord[] {
      const q = query.toLowerCase()
      // Substring match on query and correction fields (FTS-lite; sufficient for small stores)
      const rows = db
        .prepare(
          `SELECT id, ts, query, wrong AS wrongPrediction, correction, context
           FROM prediction_feedback
           WHERE lower(query) LIKE ? OR lower(correction) LIKE ?
           ORDER BY ts DESC
           LIMIT ?`,
        )
        .all(`%${q}%`, `%${q}%`, limit) as StoredFeedbackRecord[]
      return rows
    },
  }
}
