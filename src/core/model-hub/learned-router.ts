/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Learned-router seam — wires the {@link ./outcome-router.ts} bandit to the live
 * routing path under the `learned_routing` lever, while keeping
 * {@link ./tier-router.ts} 100% pure. The lever-OFF path delegates VERBATIM to
 * `routeModelForProvider`, so "lever off ⇒ byte-identical heuristic" is provable.
 *
 * Honest loop closure (no reconciliation job): the call made under the learned tier
 * writes a normal `llm_call_ledger` row (model_tier + node_id); `finalizeTask`
 * (`task-prep.ts`) later writes the episodic `outcome` for the same node. The next
 * `aggregateArmStats` join therefore credits this arm with its TRUE later outcome — a
 * failure penalizes it automatically.
 */

import type Database from 'better-sqlite3'
import { getModelPricing } from '../observability/cost-tracker.js'
import {
  PHASE_TIER_MAP,
  resolveOpenRouterModel,
  resolveTierModel,
  routeModelForProvider,
  tierForTask,
  type ModelTier,
  type RouterConfig,
  type TaskKind,
} from './tier-router.js'
import type { InternalPhase } from '../lifecycle/phase.js'
import { recommendTier, type BanditConfig, type TierRecommendation } from './outcome-router.js'
import { aggregateArmStats, armStatsForTaskType, fillTierArms, representativeTierCostUsd } from './arm-stats-store.js'
import {
  isLeverEnabled,
  resolveEconomyLeversConfig,
  type EconomyLeversConfigSource,
} from '../economy/economy-levers-config.js'
import { recordLeverEvent } from '../economy/economy-lever-ledger.js'
import type { ArmStat } from './outcome-router.js'

export const LEARNED_ROUTING_LEVER = 'learned_routing'

export interface LearnedRouterDeps {
  db: Database.Database
  leversSource: EconomyLeversConfigSource
  routerConfig: RouterConfig
  providerId?: string
}

export interface LearnedRouteResult {
  model: string
  tier: ModelTier
  heuristicTier: ModelTier
  /** 'lever-off' (or pinned) ⇒ untouched heuristic; 'cold-start' ⇒ prior; 'learned' ⇒ bandit. */
  source: 'lever-off' | 'cold-start' | 'learned'
  /** Present only when the lever is ON. */
  recommendation?: TierRecommendation
}

/** The tier the static heuristic would pick (phase overrides task-kind, mirroring routeModel). */
export function heuristicTierFor(kind: TaskKind, phase?: InternalPhase): ModelTier {
  return phase ? PHASE_TIER_MAP[phase] : tierForTask(kind)
}

function resolveModelForTier(tier: ModelTier, providerId?: string): string {
  return providerId === 'openrouter' ? resolveOpenRouterModel(tier) : resolveTierModel(tier)
}

/** Merge per-(taskType,tier) stats down to one row per tier (pull-weighted mean cost). */
function mergeByTier(stats: ArmStat[]): ArmStat[] {
  const acc = new Map<ModelTier, { pulls: number; successes: number; costWeighted: number }>()
  for (const s of stats) {
    const a = acc.get(s.tier) ?? { pulls: 0, successes: 0, costWeighted: 0 }
    a.pulls += s.pulls
    a.successes += s.successes
    a.costWeighted += s.meanCostUsd * Math.max(s.pulls, 1)
    acc.set(s.tier, a)
  }
  return [...acc.entries()].map(([tier, a]) => ({
    taskType: '',
    tier,
    pulls: a.pulls,
    successes: a.successes,
    meanCostUsd: a.costWeighted / Math.max(a.pulls, 1),
  }))
}

/**
 * Resolve the model for a task, consulting the bandit when `learned_routing` is ON.
 * Pinned configs and the lever-off path delegate verbatim to the pure heuristic.
 */
export function routeTierLearned(
  deps: LearnedRouterDeps,
  args: { kind: TaskKind; phase?: InternalPhase; taskType?: string },
  banditCfg?: Partial<BanditConfig>,
): LearnedRouteResult {
  const heuristicTier = heuristicTierFor(args.kind, args.phase)

  // Never override an explicit user pin, and keep the off-path byte-identical.
  const cfg = resolveEconomyLeversConfig(deps.leversSource)
  if (deps.routerConfig.mode === 'pinned' || !isLeverEnabled(cfg, LEARNED_ROUTING_LEVER)) {
    return {
      model: routeModelForProvider(deps.routerConfig, args.kind, deps.providerId, args.phase),
      tier: heuristicTier,
      heuristicTier,
      source: 'lever-off',
    }
  }

  const raw = args.taskType ? armStatsForTaskType(deps.db, args.taskType) : mergeByTier(aggregateArmStats(deps.db))
  const arms = fillTierArms(deps.db, args.taskType ?? '', raw)
  const rec = recommendTier(arms, heuristicTier, banditCfg)

  return {
    model: resolveModelForTier(rec.tier, deps.providerId),
    tier: rec.tier,
    heuristicTier,
    source: rec.source === 'prior' ? 'cold-start' : 'learned',
    recommendation: rec,
  }
}

export interface RecordLearnedDecisionInput {
  sessionId: string
  nodeId: string
  heuristicTier: ModelTier
  chosenTier: ModelTier
  /** Estimated USD avoided vs the heuristic tier; computed from the ledger when omitted. */
  costAvoidedUsd?: number
}

/**
 * Record the routing decision in `economy_lever_ledger` so `agf metrics
 * --economy-report` / `agf savings` surface it. Same tier as the heuristic ⇒
 * passthrough (saved 0); a cheaper learned tier ⇒ accepted, with the token-equivalent
 * of the cost avoided as `saved` and the raw USD delta in `score` (for `agf calibrate`).
 */
export function recordLearnedDecision(db: Database.Database, input: RecordLearnedDecisionInput): void {
  const sameTier = input.chosenTier === input.heuristicTier
  const costAvoidedUsd = sameTier
    ? 0
    : (input.costAvoidedUsd ??
      Math.max(0, representativeTierCostUsd(db, input.heuristicTier) - representativeTierCostUsd(db, input.chosenTier)))

  // Convert the USD delta to a token-equivalent using the heuristic tier's input price
  // so the ledger's token-denominated `saved` stays meaningful.
  const pricing = getModelPricing(resolveTierModel(input.heuristicTier))
  const saved =
    pricing && pricing.inputPer1M > 0 ? Math.max(0, Math.round((costAvoidedUsd * 1e6) / pricing.inputPer1M)) : 0

  recordLeverEvent(db, {
    surface: 'internal',
    sessionId: input.sessionId,
    nodeId: input.nodeId,
    lever: LEARNED_ROUTING_LEVER,
    tokensBefore: saved,
    tokensAfter: 0,
    saved,
    accepted: !sameTier,
    gateOutcome: sameTier ? 'passthrough' : 'accepted',
    score: costAvoidedUsd,
  })
}
