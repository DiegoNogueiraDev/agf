/*!
 * selection-quality — the ground-truth signal the GA optimises for.
 *
 * WHY: the GA had no real fitness input — it could not tell whether ACO selection actually
 * beat the deterministic priority baseline. This records, per `--aco` pick, a scalar
 * *advantage*: how much learned-value (pheromone τ) the roulette captured over what the
 * priority sort would have picked. Agree → 0 (no exploration, no regret); diverge → the τ
 * gap (positive = exploration paid off, negative = it cost). meanSelectionAdvantage feeds
 * the GA fitness (see ga-loop / done tick).
 *
 * Self-healing store (same pattern as pheromone-store): ensures its own table at point of
 * use, so a stale/locked-migration DB never breaks it. Pure compute + thin persistence.
 */

import type Database from 'better-sqlite3'

/** A candidate with the pheromone strength used as the learned-value proxy. */
export interface AdvantageCandidate {
  id: string
  pheromone: number
}

/**
 * Advantage of the ACO pick over the priority baseline = τ(acoPick) − τ(baselinePick).
 * 0 when the picks agree (or either id is unknown). Positive means the roulette chose a
 * stronger-trail task than the priority sort would have.
 */
export function computeSelectionAdvantage(
  acoPickId: string,
  baselinePickId: string,
  candidates: readonly AdvantageCandidate[],
): number {
  if (acoPickId === baselinePickId) return 0
  const aco = candidates.find((c) => c.id === acoPickId)
  const base = candidates.find((c) => c.id === baselinePickId)
  if (!aco || !base) return 0
  return aco.pheromone - base.pheromone
}

const ensuredDbs = new WeakSet<Database.Database>()

/** Idempotently ensure the selection_advantages table exists (self-heal). */
function ensureTable(db: Database.Database): void {
  if (ensuredDbs.has(db)) return
  db.exec(`
    CREATE TABLE IF NOT EXISTS selection_advantages (
      project_id  TEXT NOT NULL,
      advantage   REAL NOT NULL,
      ts          INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_selection_adv_project ON selection_advantages(project_id);
  `)
  ensuredDbs.add(db)
}

/** Persist one selection-advantage observation for a project. */
export function recordSelectionAdvantage(
  db: Database.Database,
  projectId: string,
  advantage: number,
  nowMs: number = Date.now(),
): void {
  ensureTable(db)
  db.prepare('INSERT INTO selection_advantages (project_id, advantage, ts) VALUES (?, ?, ?)').run(
    projectId,
    advantage,
    nowMs,
  )
}

/** Mean recorded advantage for a project (0 when none recorded). GA fitness input. */
export function meanSelectionAdvantage(db: Database.Database, projectId: string): number {
  ensureTable(db)
  const row = db
    .prepare('SELECT AVG(advantage) AS mean FROM selection_advantages WHERE project_id = ?')
    .get(projectId) as { mean: number | null } | undefined
  return row?.mean ?? 0
}

// ── Selection episodes (T6a) ────────────────────────────────────────────────
// A richer record than the scalar advantage above: the FULL candidate set at a
// pick plus the realized target. This is what lets the GA attribute outcomes to
// genomes — any genome's α/β can be replayed over an episode to see how highly it
// would have ranked the target (see ga-loop replayFitness). Scalar advantage
// can't do that: it's the outcome of ONE (live) genome, not a per-genome signal.

/** One candidate's η-inputs + trail strength, as seen at selection time. */
export interface SelectionEpisodeCandidate {
  id: string
  priority: number
  size: number
  blockingImpact: number
  acCount: number
  pheromone: number
}

/** A single ACO pick: the candidates considered and the id that was realized. */
export interface SelectionEpisode {
  candidates: SelectionEpisodeCandidate[]
  targetId: string
}

const ensuredEpisodeDbs = new WeakSet<Database.Database>()

/** Idempotently ensure the selection_episodes table exists (self-heal). */
function ensureEpisodeTable(db: Database.Database): void {
  if (ensuredEpisodeDbs.has(db)) return
  db.exec(`
    CREATE TABLE IF NOT EXISTS selection_episodes (
      project_id     TEXT NOT NULL,
      candidates_json TEXT NOT NULL,
      target_id      TEXT NOT NULL,
      ts             INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_selection_epi_project ON selection_episodes(project_id);
  `)
  ensuredEpisodeDbs.add(db)
}

/** Persist one selection episode (candidates snapshot + realized target). */
export function recordSelectionEpisode(
  db: Database.Database,
  projectId: string,
  episode: SelectionEpisode,
  nowMs: number = Date.now(),
): void {
  ensureEpisodeTable(db)
  db.prepare('INSERT INTO selection_episodes (project_id, candidates_json, target_id, ts) VALUES (?, ?, ?, ?)').run(
    projectId,
    JSON.stringify(episode.candidates),
    episode.targetId,
    nowMs,
  )
}

/** Read the most-recent episodes for a project (newest first; [] when none). */
export function readSelectionEpisodes(
  db: Database.Database,
  projectId: string,
  limit: number = 200,
): SelectionEpisode[] {
  ensureEpisodeTable(db)
  const rows = db
    .prepare('SELECT candidates_json, target_id FROM selection_episodes WHERE project_id = ? ORDER BY ts DESC LIMIT ?')
    .all(projectId, limit) as Array<{ candidates_json: string; target_id: string }>
  return rows.map((r) => ({
    candidates: JSON.parse(r.candidates_json) as SelectionEpisodeCandidate[],
    targetId: r.target_id,
  }))
}
