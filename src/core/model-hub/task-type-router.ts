/*!
 * Task-type-aware model router — implements `agf model route --task-type`.
 * Task node_45f9b3e8d571.
 *
 * WHY: Provides a structured routing recommendation per task type with
 * confidence + estimated cost, and persists routing decisions so observability
 * tools can measure RL accuracy over time.
 *
 * Composes with: tier-router.ts (TIER_TASK_KIND map), outcome-router bandit
 * results, model-route-decision-ledger table.
 */

import type Database from 'better-sqlite3'

/** USD-per-1k-tokens estimates per tier (conservative baseline). */
const COST_PER_1K: Record<string, number> = {
  cheap: 0.00025,
  build: 0.003,
  frontier: 0.015,
}

/** Default model per tier (byte-identical with tier-router defaults). */
const TIER_DEFAULT: Record<string, string> = {
  cheap: 'claude-haiku-4-5',
  build: 'claude-sonnet-4-6',
  frontier: 'claude-opus-4-8',
}

/** Task-type → tier heuristic (mirrors tier-router TaskKind → ModelTier map). */
const TASK_TIER: Record<string, string> = {
  classify: 'cheap',
  status: 'cheap',
  implement: 'build',
  review: 'build',
  plan: 'frontier',
}

/** Average tokens assumed per routing call (used for estimated_cost). */
const AVG_TOKENS = 2000

export interface RouteTaskTypeResult {
  recommended_model: string
  confidence: number
  estimated_cost: number
  tier: string
}

/**
 * Route a task type to a recommended model using the heuristic tier map,
 * enriched with confidence (0–1) and estimated_cost in USD.
 * Cold-start confidence = 0.5 (prior only); future versions wire the bandit arms.
 */
export function routeTaskType(db: Database.Database, taskType: string): RouteTaskTypeResult {
  void db // reserved for bandit arm lookup in future iterations
  const tier = TASK_TIER[taskType] ?? 'build'
  const recommended_model = TIER_DEFAULT[tier] ?? TIER_DEFAULT.build
  const confidence = TASK_TIER[taskType] !== undefined ? 0.8 : 0.5
  const estimated_cost = ((COST_PER_1K[tier] ?? COST_PER_1K.build) * AVG_TOKENS) / 1000
  return { recommended_model, confidence, estimated_cost, tier }
}

const CREATE_LEDGER = `
  CREATE TABLE IF NOT EXISTS route_decision_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_type TEXT NOT NULL,
    model_selected TEXT NOT NULL,
    confidence REAL NOT NULL,
    actual_cost REAL NOT NULL,
    created_at TEXT NOT NULL
  )
`

export interface RoutingDecision {
  taskType: string
  modelSelected: string
  confidence: number
  actualCost: number
}

export interface RoutingDecisionRow extends RoutingDecision {
  id: number
  createdAt: string
}

export function saveRoutingDecision(db: Database.Database, decision: RoutingDecision): void {
  db.exec(CREATE_LEDGER)
  db.prepare(
    `INSERT INTO route_decision_ledger (task_type, model_selected, confidence, actual_cost, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(decision.taskType, decision.modelSelected, decision.confidence, decision.actualCost, new Date().toISOString())
}

export function listRoutingDecisions(db: Database.Database): RoutingDecisionRow[] {
  db.exec(CREATE_LEDGER)
  const rows = db
    .prepare(
      `SELECT id, task_type, model_selected, confidence, actual_cost, created_at
       FROM route_decision_ledger ORDER BY created_at DESC`,
    )
    .all() as Array<{
    id: number
    task_type: string
    model_selected: string
    confidence: number
    actual_cost: number
    created_at: string
  }>
  return rows.map((r) => ({
    id: r.id,
    taskType: r.task_type,
    modelSelected: r.model_selected,
    confidence: r.confidence,
    actualCost: r.actual_cost,
    createdAt: r.created_at,
  }))
}
