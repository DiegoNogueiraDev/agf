/*!
 * Plan template store — persists extracted plan templates from completed executions.
 * Task node_56beedcb2ec5.
 *
 * WHY: Captures task_type/ac_pattern/solution_approach/tokens_used after each
 * successful execution so future planning can reuse proven patterns (ACO stigmergy).
 * Pure DB helpers; no LLM, no I/O beyond the provided Database handle.
 *
 * Composes with: SqliteStore (getDb()), agf cache plan-store list CLI subcommand.
 */

import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'

export interface PlanTemplate {
  id: string
  taskType: string
  acPattern: string
  solutionApproach: string
  tokensUsed: number
  createdAt: string
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS plan_templates (
    id TEXT PRIMARY KEY,
    task_type TEXT NOT NULL,
    ac_pattern TEXT NOT NULL,
    solution_approach TEXT NOT NULL,
    tokens_used INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )
`

function ensureTable(db: Database.Database): void {
  db.exec(CREATE_TABLE)
}

export function savePlanTemplate(db: Database.Database, tpl: Omit<PlanTemplate, 'id' | 'createdAt'>): PlanTemplate {
  ensureTable(db)
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  db.prepare(
    `INSERT INTO plan_templates (id, task_type, ac_pattern, solution_approach, tokens_used, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, tpl.taskType, tpl.acPattern, tpl.solutionApproach, tpl.tokensUsed, createdAt)
  return { id, ...tpl, createdAt }
}

export interface PlanLookupResult {
  template: PlanTemplate
  /** Jaccard word-overlap similarity in [0, 1]. */
  similarity: number
}

/** Tokenise text to a lowercase word set for Jaccard comparison. */
function wordSet(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/\W+/).filter(Boolean))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let intersection = 0
  for (const w of a) if (b.has(w)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * Find the most similar plan template for the given taskType.
 * Returns null when no template exceeds `minSimilarity` (default 0.7).
 */
export function lookupPlanTemplate(
  db: Database.Database,
  taskType: string,
  minSimilarity = 0.7,
): PlanLookupResult | null {
  const all = listPlanTemplates(db)
  if (all.length === 0) return null
  const query = wordSet(taskType)
  let best: PlanLookupResult | null = null
  for (const tpl of all) {
    const sim = jaccard(query, wordSet(tpl.taskType))
    if (sim >= minSimilarity && (best === null || sim > best.similarity)) {
      best = { template: tpl, similarity: sim }
    }
  }
  return best
}

export function listPlanTemplates(db: Database.Database): PlanTemplate[] {
  ensureTable(db)
  const rows = db
    .prepare(
      `SELECT id, task_type, ac_pattern, solution_approach, tokens_used, created_at
       FROM plan_templates ORDER BY created_at DESC`,
    )
    .all() as Array<{
    id: string
    task_type: string
    ac_pattern: string
    solution_approach: string
    tokens_used: number
    created_at: string
  }>
  return rows.map((r) => ({
    id: r.id,
    taskType: r.task_type,
    acPattern: r.ac_pattern,
    solutionApproach: r.solution_approach,
    tokensUsed: r.tokens_used,
    createdAt: r.created_at,
  }))
}
