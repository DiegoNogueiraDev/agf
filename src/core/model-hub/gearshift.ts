/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Gearshift — a single "auto mode" gear lever (1-4) composing tier-router's
 * complexity scoring with an effort decision, so callers get one concrete,
 * zero-token recommendation instead of juggling tier + effort separately.
 *
 * The 3 model tiers (cheap/build/frontier) only give 3 buckets; `build` is the
 * widest complexity range (score 10-25), so gearshift splits it into a low
 * sub-range (gear 2) and a high sub-range (gear 3) — the "upshift" a task
 * takes as it approaches frontier without actually needing frontier yet.
 *
 * Effort is NOT delegated to `chooseEffort` (effort-router.ts): that function's
 * signal shape (TaskKind + retry attempt) models retry escalation, not an
 * upfront complexity estimate — the two don't compose on the same axis. Here
 * effort is simply `high` for frontier-tier work (genuine synthesis/security
 * risk) and `low` otherwise, reusing only the `ReasoningEffort` vocabulary.
 *
 * outcome-router.ts (the learned/bandit tier layer) is intentionally NOT
 * composed here — it needs `ArmStat[]` from a store query, which would make
 * this an async, I/O-touching function; gearshift stays a pure, zero-token
 * synchronous decision as the AC requires.
 */
import {
  computeComplexityScore,
  tierForComplexity,
  resolveTierModel,
  type ModelTier,
  type TaskFeatures,
} from './tier-router.js'
import type { ReasoningEffort } from './effort-router.js'

/** Gear 1 (cheap) through gear 4 (frontier) — see module docblock for the split rationale. */
export type Gear = 1 | 2 | 3 | 4

export interface AutoGearResult {
  gear: Gear
  tier: ModelTier
  model: string
  effort: ReasoningEffort
  rationale: string
}

/** Score boundary between the build tier's low (gear 2) and high (gear 3) sub-ranges. */
const BUILD_HIGH_SUBRANGE_FLOOR = 18

/** Safe default gear returned when `autoMode` is off — matches tier-router's DEFAULT_MODEL tier. */
const SAFE_DEFAULT_GEAR: Gear = 2
const SAFE_DEFAULT_TIER: ModelTier = 'build'

/**
 * Map a complexity score to a gear (1-4). Reuses `tierForComplexity` for the
 * tier boundaries; subdivides the `build` range at {@link BUILD_HIGH_SUBRANGE_FLOOR}.
 */
export function gearForComplexity(score: number): Gear {
  const tier = tierForComplexity(score)
  if (tier === 'cheap') return 1
  if (tier === 'frontier') return 4
  return score >= BUILD_HIGH_SUBRANGE_FLOOR ? 3 : 2
}

/** Reverse of the gear split: gear 1 -> cheap, 2/3 -> build, 4 -> frontier. */
export function tierForGear(gear: Gear): ModelTier {
  if (gear === 1) return 'cheap'
  if (gear === 4) return 'frontier'
  return 'build'
}

/**
 * Resolve one task's features to a concrete gear/tier/model/effort — zero LLM
 * calls, deterministic. `autoMode=false` skips feature-based computation
 * entirely and returns the safe default gear (auto routing desligado).
 */
export function resolveAutoGear(features: TaskFeatures, autoMode: boolean): AutoGearResult {
  if (!autoMode) {
    return {
      gear: SAFE_DEFAULT_GEAR,
      tier: SAFE_DEFAULT_TIER,
      model: resolveTierModel(SAFE_DEFAULT_TIER),
      effort: 'low',
      rationale: 'auto mode desligado (off) — usando o gear seguro default (build/low), sem calcular complexidade.',
    }
  }

  const score = computeComplexityScore(features)
  const gear = gearForComplexity(score)
  const tier = tierForComplexity(score)
  const effort: ReasoningEffort = tier === 'frontier' ? 'high' : 'low'

  return {
    gear,
    tier,
    model: resolveTierModel(tier),
    effort,
    rationale: `score=${score} (ac=${features.acCount}, deps=${features.dependencyCount}, blockers=${features.blockerCount}, size=${features.xpSize ?? '-'}, tags=${(features.tags ?? []).join(',') || '-'}) -> tier=${tier}, gear=${gear}, effort=${effort}`,
  }
}

/** Bump a gear by one rung, capped at 4 (frontier) — never wraps or goes negative. */
export function escalateGear(gear: Gear): Gear {
  return gear >= 4 ? 4 : ((gear + 1) as Gear)
}

/** Drop a gear by one rung, floored at 1 (cheap) — the inverse of {@link escalateGear}. */
export function deescalateGear(gear: Gear): Gear {
  return gear <= 1 ? 1 : ((gear - 1) as Gear)
}

/** Gear (1-4) -> ReasoningEffort, a monotonic progression for the manual `gearshift` CLI surface. */
export function effortForGear(gear: Gear): ReasoningEffort {
  if (gear === 1) return 'low'
  if (gear === 2) return 'medium'
  return 'high'
}

/** Minimal real pulls before the cheap arm's success rate counts as evidence (not noise). */
const CHEAP_FAILURE_MIN_PULLS = 3
/** Below this success rate, the cheap tier's track record counts as "history of failure". */
const CHEAP_FAILURE_RATE_CEILING = 0.5

/** Cheap-tier bandit evidence, shaped like `ArmStat` (see outcome-router.ts) without importing it. */
export interface CheapArmEvidence {
  pulls: number
  successes: number
}

/**
 * True when the cheap tier has enough real history AND a low success rate —
 * the signal `applyGearToExecutor` (start-cmd.ts) uses to escalate gear by one
 * rung above the heuristic (AC3 of node_cda7713751cc). Reads pre-fetched
 * evidence (`ArmStat` from arm-stats-store.ts) rather than querying a store
 * itself, keeping this function pure/sync/testable.
 */
export function shouldEscalateFromCheapFailures(evidence: CheapArmEvidence | undefined): boolean {
  if (!evidence || evidence.pulls < CHEAP_FAILURE_MIN_PULLS) return false
  return evidence.successes / evidence.pulls < CHEAP_FAILURE_RATE_CEILING
}
