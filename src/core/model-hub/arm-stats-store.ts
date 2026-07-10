/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Arm-stats store — the read-only SQL that turns the project's existing ledgers into
 * bandit evidence for the `learned_routing` lever, WITHOUT a schema migration.
 *
 * `episodic_outcomes` records per-task `(task_type, outcome)`; `llm_call_ledger`
 * records per-call `(model_tier, cost_usd)`. Joining on `node_id` recovers which tier
 * did the work and what it cost — so each `(task_type, tier)` becomes a bandit arm
 * ({@link ArmStat}). A node may have many ledger rows (retries) but one episodic
 * outcome, so the ledger is collapsed PER NODE first (representative tier = the
 * highest-cost call, i.e. the one that mattered) before the 1:1 join — otherwise pulls
 * fan out and double-count.
 */

import type Database from 'better-sqlite3'
import { getModelPricing } from '../observability/cost-tracker.js'
import { resolveTierModel, type ModelTier } from './tier-router.js'
import type { ArmStat } from './outcome-router.js'

export interface AggregateArmStatsOptions {
  /** Restrict to one normalized task_type (as built by `buildTaskType`). */
  taskType?: string
  /** Only consider outcomes within this many days. */
  maxAgeDays?: number
}

interface ArmRow {
  taskType: string
  tier: string
  pulls: number
  successes: number
  meanCostUsd: number
}

/**
 * Aggregate `(task_type, tier)` arm statistics from the episodic ⋈ ledger join.
 * Null/absent `model_tier` rows are grouped as '(unknown)' and excluded from the three
 * real tiers (they cannot map to a {@link ModelTier}). Nodes with no ledger row are
 * dropped by the inner join (no tier ⇒ no attributable arm).
 */
export function aggregateArmStats(db: Database.Database, opts: AggregateArmStatsOptions = {}): ArmStat[] {
  const conditions: string[] = [`lpn.tier IN ('cheap','build','frontier')`]
  const params: unknown[] = []
  if (opts.taskType) {
    conditions.push('e.task_type = ?')
    params.push(opts.taskType)
  }
  if (opts.maxAgeDays) {
    conditions.push('e.created_at >= ?')
    params.push(Date.now() - opts.maxAgeDays * 24 * 3600 * 1000)
  }

  const rows = db
    .prepare(
      `WITH ledger_per_node AS (
         SELECT
           node_id,
           COALESCE(
             (SELECT l2.model_tier FROM llm_call_ledger l2
               WHERE l2.node_id = l.node_id AND l2.model_tier IS NOT NULL
               ORDER BY l2.cost_usd DESC, l2.ts DESC LIMIT 1),
             '(unknown)'
           ) AS tier,
           AVG(cost_usd) AS mean_cost
         FROM llm_call_ledger l
         WHERE node_id IS NOT NULL
         GROUP BY node_id
       )
       SELECT
         e.task_type AS taskType,
         lpn.tier AS tier,
         COUNT(*) AS pulls,
         SUM(CASE WHEN e.outcome = 'success' THEN 1 ELSE 0 END) AS successes,
         COALESCE(AVG(lpn.mean_cost), 0) AS meanCostUsd
       FROM episodic_outcomes e
       JOIN ledger_per_node lpn ON lpn.node_id = e.node_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY e.task_type, lpn.tier
       ORDER BY e.task_type, lpn.tier`,
    )
    .all(...params) as ArmRow[]

  return rows.map((r) => ({
    taskType: r.taskType,
    tier: r.tier as ModelTier,
    pulls: r.pulls,
    successes: r.successes,
    meanCostUsd: r.meanCostUsd,
  }))
}

/** Convenience: arm stats for a single task type. */
export function armStatsForTaskType(db: Database.Database, taskType: string): ArmStat[] {
  return aggregateArmStats(db, { taskType })
}

/** Nominal task token shape used to price a tier when the ledger has no rows for it. */
const NOMINAL_INPUT_TOKENS = 1000
const NOMINAL_OUTPUT_TOKENS = 300

/**
 * Representative cost (USD) for a tier: the observed average from the ledger, falling
 * back to `MODEL_PRICING` for the tier's default model on a nominal token mix. Always
 * finite and ≥ 0 so a never-tried tier still gets a sensible cost (not "free").
 */
export function representativeTierCostUsd(db: Database.Database, tier: ModelTier): number {
  const row = db
    .prepare(`SELECT AVG(cost_usd) AS avgCost FROM llm_call_ledger WHERE model_tier = ? AND cost_usd > 0`)
    .get(tier) as { avgCost: number | null } | undefined
  if (row?.avgCost && row.avgCost > 0) return row.avgCost

  const pricing = getModelPricing(resolveTierModel(tier))
  if (!pricing) return 0
  return (pricing.inputPer1M * NOMINAL_INPUT_TOKENS + pricing.outputPer1M * NOMINAL_OUTPUT_TOKENS) / 1e6
}

/**
 * Fill the three tiers so the bandit always sees every arm with a sensible cost: arms
 * present in `stats` keep their observed evidence; missing tiers get `pulls:0` with the
 * representative cost (so they are reached only via the UCB1 exploration bonus, never
 * via a fake "free" reward).
 */
export function fillTierArms(db: Database.Database, taskType: string, stats: ArmStat[]): ArmStat[] {
  const byTier = new Map<ModelTier, ArmStat>()
  for (const s of stats) byTier.set(s.tier, s)
  const tiers: ModelTier[] = ['cheap', 'build', 'frontier']
  return tiers.map(
    (tier) =>
      byTier.get(tier) ?? {
        taskType,
        tier,
        pulls: 0,
        successes: 0,
        meanCostUsd: representativeTierCostUsd(db, tier),
      },
  )
}
