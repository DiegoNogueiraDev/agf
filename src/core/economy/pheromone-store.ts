/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * SQLite-backed pheromone trails for the `stigmergy` lever (Dorigo ACO / stigmergy).
 *
 * Each `agf` command is a fresh process, so the in-memory {@link PheromoneTrail}
 * cannot carry a trail across tasks. This store persists the same `e^{-λt}`
 * evaporation math: a successful task deposits a marker on the files it touched,
 * and the next task reads the strongest trails (~tiny tokens) instead of
 * re-deriving which files matter — indirect coordination through the environment.
 *
 * Pure data access; opt-in (the lever gate lives at the call sites).
 */

import type Database from 'better-sqlite3'

/** Default trail half-life: 7 days (a marker fades to half strength in a week). */
export const PHEROMONE_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000

// DBs already known to have the table — avoids re-running the DDL on every store call.
const ensuredDbs = new WeakSet<Database.Database>()

/**
 * Idempotently ensure the pheromone_trails table exists (self-heal).
 *
 * WHY: the v114 migration can be recorded in `_migrations` while the table is absent
 * (ledger/effect divergence — e.g. a restored/copied DB), which the migration runner will
 * never repair because it skips already-recorded versions. That made `agf next --aco` throw
 * "no such table: pheromone_trails" and silently drop `agf done` deposits (bug
 * node_31eab5a12cd6). Ensuring at point of use keeps ACO working on any DB regardless of
 * ledger state. DDL is identical to migration v114; `IF NOT EXISTS` makes it a no-op when
 * the table already exists.
 */
export function ensurePheromoneTable(db: Database.Database): void {
  if (ensuredDbs.has(db)) return
  db.exec(`
    CREATE TABLE IF NOT EXISTS pheromone_trails (
      project_id  TEXT NOT NULL,
      key         TEXT NOT NULL,
      amount      REAL NOT NULL,
      ts          INTEGER NOT NULL,
      PRIMARY KEY (project_id, key)
    );
    CREATE INDEX IF NOT EXISTS idx_pheromone_project ON pheromone_trails(project_id);
  `)
  ensuredDbs.add(db)
}

/** Strengths below this are treated as gone. */
export const PHEROMONE_EPSILON = 1e-3

const lambda = (halfLifeMs: number): number => Math.LN2 / halfLifeMs

/** Evaporate `amount` laid down at `ts` to `nowMs` under the half-life decay. */
function evaporate(amount: number, ts: number, nowMs: number, halfLifeMs: number): number {
  const dt = Math.max(0, nowMs - ts)
  return amount * Math.exp(-lambda(halfLifeMs) * dt)
}

/**
 * Reinforce a trail: evaporate the existing strength to `nowMs`, then add `amount`.
 * Upserts `(project_id, key)`.
 */
export function depositPheromone(
  db: Database.Database,
  projectId: string,
  key: string,
  amount = 1,
  nowMs: number = Date.now(),
  halfLifeMs: number = PHEROMONE_HALF_LIFE_MS,
): void {
  ensurePheromoneTable(db)
  const row = db
    .prepare('SELECT amount, ts FROM pheromone_trails WHERE project_id = ? AND key = ?')
    .get(projectId, key) as { amount: number; ts: number } | undefined
  const decayed = row ? evaporate(row.amount, row.ts, nowMs, halfLifeMs) : 0
  db.prepare(
    `INSERT INTO pheromone_trails (project_id, key, amount, ts)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(project_id, key) DO UPDATE SET amount = excluded.amount, ts = excluded.ts`,
  ).run(projectId, key, decayed + amount, nowMs)
}

/**
 * Deposit per-dimension pheromone trails from a harness delta snapshot.
 *
 * Key format: `dimension:<dim>:pattern:<tag>`.
 * Amount = `delta / 10` (10 pt improvement → strength 1.0).
 * Dimensions with delta ≤ 0 are skipped — no negative reinforcement.
 */
export function depositHarnessDimensionPheromone(
  db: Database.Database,
  projectId: string,
  harnessDelta: Record<string, number>,
  tag: string,
  nowMs: number = Date.now(),
  halfLifeMs: number = PHEROMONE_HALF_LIFE_MS,
): void {
  for (const [dim, delta] of Object.entries(harnessDelta)) {
    if (delta <= 0) continue
    depositPheromone(db, projectId, `dimension:${dim}:pattern:${tag}`, delta / 10, nowMs, halfLifeMs)
  }
}

/**
 * Remove weak trails (amount < epsilon) that have also exceeded maxAgeMs.
 * This prevents accumulation of negligible trails while preserving strong
 * or recently-active ones.
 * Returns the count of deleted rows.
 */
export function pruneExpiredTrails(
  db: Database.Database,
  projectId: string,
  epsilon = 0.05,
  maxAgeMs = 30 * 24 * 60 * 60 * 1000,
  nowMs: number = Date.now(),
): number {
  ensurePheromoneTable(db)
  const cutoff = nowMs - maxAgeMs
  const result = db
    .prepare('DELETE FROM pheromone_trails WHERE project_id = ? AND amount < ? AND ts < ?')
    .run(projectId, epsilon, cutoff)
  return result.changes as number
}

export interface PheromoneStrength {
  key: string
  strength: number
}

export interface WeakTrailPruneResult {
  pruned_count: number
  total_trails: number
  strongest_surviving: PheromoneStrength | null
}

/**
 * Prune trails whose effective (evaporated) strength is below `threshold`.
 * When `apply` is `false` (dry-run): returns stats without mutating the DB.
 * When `apply` is `true`: deletes the weak trails and returns final stats.
 */
export function pruneWeakTrails(
  db: Database.Database,
  projectId: string,
  threshold = 0.05,
  apply = false,
  nowMs: number = Date.now(),
  halfLifeMs: number = PHEROMONE_HALF_LIFE_MS,
): WeakTrailPruneResult {
  ensurePheromoneTable(db)
  const rows = db.prepare('SELECT key, amount, ts FROM pheromone_trails WHERE project_id = ?').all(projectId) as Array<{
    key: string
    amount: number
    ts: number
  }>

  const total_trails = rows.length

  const withStrength = rows.map((r) => ({
    key: r.key,
    strength: evaporate(r.amount, r.ts, nowMs, halfLifeMs),
  }))

  const weak = withStrength.filter((r) => r.strength < threshold)
  const surviving = withStrength.filter((r) => r.strength >= threshold)

  if (apply && weak.length > 0) {
    const del = db.prepare('DELETE FROM pheromone_trails WHERE project_id = ? AND key = ?')
    const deleteMany = db.transaction(() => {
      for (const w of weak) del.run(projectId, w.key)
    })
    deleteMany()
  }

  surviving.sort((a, b) => b.strength - a.strength)
  const strongest_surviving = surviving.length > 0 ? surviving[0]! : null

  return { pruned_count: weak.length, total_trails, strongest_surviving }
}

/**
 * The strongest trails for a project at `nowMs`, decayed and filtered above
 * epsilon, highest strength first (capped at `limit`).
 */
export function strongestPheromones(
  db: Database.Database,
  projectId: string,
  limit = 5,
  nowMs: number = Date.now(),
  halfLifeMs: number = PHEROMONE_HALF_LIFE_MS,
): PheromoneStrength[] {
  ensurePheromoneTable(db)
  const rows = db.prepare('SELECT key, amount, ts FROM pheromone_trails WHERE project_id = ?').all(projectId) as Array<{
    key: string
    amount: number
    ts: number
  }>
  return rows
    .map((r) => ({ key: r.key, strength: evaporate(r.amount, r.ts, nowMs, halfLifeMs) }))
    .filter((r) => r.strength >= PHEROMONE_EPSILON)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, Math.max(0, limit))
}

/**
 * Aggregate pheromone strength for a task based on its tags.
 * Sums the evaporated strength of all trails whose key contains any of the given tags.
 * Returns 0 if `tags` is empty or no matching trails exist.
 */
export function getAggregatedTagPheromone(
  db: Database.Database,
  projectId: string,
  tags: string[],
  nowMs: number = Date.now(),
  halfLifeMs: number = PHEROMONE_HALF_LIFE_MS,
): number {
  if (tags.length === 0) return 0
  ensurePheromoneTable(db)
  const rows = db.prepare('SELECT key, amount, ts FROM pheromone_trails WHERE project_id = ?').all(projectId) as Array<{
    key: string
    amount: number
    ts: number
  }>
  return rows.reduce((sum, r) => {
    if (!tags.some((tag) => r.key.includes(tag))) return sum
    const strength = evaporate(r.amount, r.ts, nowMs, halfLifeMs)
    return sum + (strength >= PHEROMONE_EPSILON ? strength : 0)
  }, 0)
}
