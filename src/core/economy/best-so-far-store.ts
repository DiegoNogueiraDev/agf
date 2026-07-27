/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * best-so-far-store — the elitist memory an MMAS stagnation reset must not wipe.
 *
 * WHY: mmasReset re-diversifies the τ field to τ_max UNIFORMLY (an invariant the
 * colony needs to escape convergence). That erases *which* trail was winning —
 * the "reset wipes good learning" risk (node_42e2b0c49a94). Rather than break the
 * uniform-reset invariant with a naive top-K carve-out, we remember the champion
 * key in a SEPARATE, single-row memory so re-diversification keeps the field's
 * entropy while the best-so-far survives for the next elitist reinforcement.
 *
 * Self-healing store (same pattern as selection-quality / pheromone-store): the
 * table is ensured at point of use, so a stale/locked-migration DB never breaks it.
 */

import type Database from 'better-sqlite3'

/** The remembered champion: its trail key and the strength at which it was seen. */
export interface BestSoFar {
  key: string
  strength: number
}

const ensuredDbs = new WeakSet<Database.Database>()

/** Idempotently ensure the single-row best_so_far table exists (self-heal). */
function ensureTable(db: Database.Database): void {
  if (ensuredDbs.has(db)) return
  db.exec(`
    CREATE TABLE IF NOT EXISTS best_so_far (
      project_id TEXT PRIMARY KEY,
      key        TEXT NOT NULL,
      strength   REAL NOT NULL,
      ts         INTEGER NOT NULL
    );
  `)
  ensuredDbs.add(db)
}

/**
 * Record a champion observation. Keeps the STRONGEST ever seen (best-so-far, not
 * last-seen) so a later, weaker trail never displaces the true champion.
 */
export function recordBestSoFar(
  db: Database.Database,
  projectId: string,
  key: string,
  strength: number,
  nowMs: number = Date.now(),
): void {
  ensureTable(db)
  const prev = readBestSoFar(db, projectId)
  if (prev !== null && prev.strength >= strength) return
  db.prepare(
    `INSERT INTO best_so_far (project_id, key, strength, ts) VALUES (?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET key = excluded.key, strength = excluded.strength, ts = excluded.ts`,
  ).run(projectId, key, strength, nowMs)
}

/** The remembered champion for a project, or null when none has been recorded. */
export function readBestSoFar(db: Database.Database, projectId: string): BestSoFar | null {
  ensureTable(db)
  const row = db.prepare('SELECT key, strength FROM best_so_far WHERE project_id = ?').get(projectId) as
    { key: string; strength: number } | undefined
  return row ? { key: row.key, strength: row.strength } : null
}
