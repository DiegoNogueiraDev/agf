/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Outcome-driven tier selection — the math core of the `learned_routing` lever.
 *
 * The model tier (cheap/build/frontier) is the single biggest cost AND first-pass
 * quality lever in the loop, yet {@link ../model-hub/tier-router.ts} chooses it with
 * a static heuristic that never learns. Here each `(taskType, tier)` is a bandit
 * **arm**; the reward is the project's own decision metric — **success rate per unit
 * cost** ("custo por sucesso", see `episodic-outcomes-store.ts`). We select with
 * **UCB1** (Auer, Cesa-Bianchi & Fischer 2002, *Finite-time analysis of the
 * multiarmed bandit problem*): deterministic, no PRNG, finite-time regret bound — the
 * canonical explore/exploit solution, and the way the brain itself trades off
 * exploration (Daw et al. 2006; dopaminergic reward-prediction-error, Schultz 1997).
 *
 * The existing heuristic is folded in as an **informative Bayesian prior**: with no /
 * sparse data the prior tier wins verbatim, so enabling the lever on a fresh DB
 * changes nothing until evidence accrues (byte-identical cold start). Pure &
 * injectable — no DB import. The SQL that builds {@link ArmStat}s lives in
 * `arm-stats-store.ts`; the lever gate + ledger wiring in `learned-router.ts`.
 */

import { MODEL_TIERS, type ModelTier } from './tier-router.js'

/** Identity of a bandit arm: a tier tried for a given (normalized) task type. */
export interface ArmKey {
  taskType: string
  tier: ModelTier
}

/** Aggregated evidence for one arm, built by `arm-stats-store.ts` from the ledger join. */
export interface ArmStat {
  taskType: string
  tier: ModelTier
  /** Number of finished tasks attributed to this (taskType, tier). */
  pulls: number
  /** How many of those finished with outcome='success' (Bernoulli reward numerator). */
  successes: number
  /** Mean cost (USD) of the calls behind those pulls; 0 when unpriced (e.g. Copilot). */
  meanCostUsd: number
}

export interface BanditConfig {
  /** Below this TOTAL real pull count the router defers to the heuristic prior. */
  minObservations: number
  /** UCB1 exploration constant `c` in `mean + c·sqrt(2 ln N / n)`. Canonical = 1. */
  explorationC: number
  /** Pseudocount weight of the informative (heuristic) prior. 2 ⇒ worth 2 successful pulls. */
  priorStrength: number
  /** Floor for cost (USD) so an unpriced/zero-cost arm never divides by zero. */
  costFloorUsd: number
  /** Selection algorithm. 'ucb1' (default, deterministic) | 'thompson' (seeded). */
  algorithm: 'ucb1' | 'thompson'
}

export const DEFAULT_BANDIT_CONFIG: BanditConfig = {
  minObservations: 5,
  explorationC: 1,
  priorStrength: 2,
  costFloorUsd: 1e-6,
  algorithm: 'ucb1',
}

export type RecommendationReason = 'cold-start' | 'exploit' | 'explore' | 'tie-break'

export interface ArmBreakdown {
  tier: ModelTier
  pulls: number
  /** Raw cost-per-success reward (success-rate ÷ cost); higher is better. */
  reward: number
  /** UCB1 index actually used for selection (normalized reward + exploration bonus). */
  ucb1: number
}

export interface TierRecommendation {
  tier: ModelTier
  /** 'prior' ⇒ cold-start fell back to the heuristic; 'learned' ⇒ chosen by the bandit. */
  source: 'learned' | 'prior'
  /** UCB1 index of the chosen arm (0 at cold-start). */
  score: number
  reason: RecommendationReason
  arms: ArmBreakdown[]
}

function cfgWith(cfg?: Partial<BanditConfig>): BanditConfig {
  return { ...DEFAULT_BANDIT_CONFIG, ...(cfg ?? {}) }
}

/**
 * Raw reward of an arm = **success rate per unit cost** (the project's "custo por
 * sucesso" metric, inverted so higher is better). Laplace-smoothed (Beta(1,1)) so a
 * never-successful arm is never exactly zero, and cost-floored so an unpriced arm
 * never divides by zero. Pure & deterministic.
 */
export function armReward(stat: ArmStat, cfg?: Partial<BanditConfig>): number {
  const c = cfgWith(cfg)
  const rate = (stat.successes + 1) / (stat.pulls + 2)
  const cost = Math.max(stat.meanCostUsd, c.costFloorUsd)
  return rate / cost
}

/**
 * Textbook UCB1 index for one arm given a reward already normalized to [0,1] and the
 * arm's effective pull count. `meanReward + c·sqrt(2 ln N / n)`. `n` is floored at 1
 * so an unplayed arm yields a large (finite, deterministic) exploration bonus rather
 * than Infinity. Pure.
 */
export function ucb1Score(
  meanReward: number,
  armPulls: number,
  totalPulls: number,
  cfg?: Partial<BanditConfig>,
): number {
  const c = cfgWith(cfg)
  const n = Math.max(armPulls, 1)
  const N = Math.max(totalPulls, 1)
  const bonus = c.explorationC * Math.sqrt((2 * Math.log(N)) / n)
  return meanReward + bonus
}

/** Stable tier-preference index (lower wins ties): cheap < build < frontier. */
function tierIndex(tier: ModelTier): number {
  return MODEL_TIERS.indexOf(tier)
}

interface InternalArm {
  tier: ModelTier
  realPulls: number
  /** Effective pulls used for both reward smoothing and the UCB1 bonus (prior boosts the prior tier). */
  effPulls: number
  reward: number
  ucb1: number
}

/**
 * Build one internal arm per tier, folding the heuristic in as an informative prior:
 * the `priorTier` arm receives `priorStrength` extra **successful** pseudo-pulls, so
 * with thin data the bandit trusts the heuristic and only the unknown tiers carry a
 * large exploration bonus.
 */
function buildArms(stats: ArmStat[], priorTier: ModelTier, c: BanditConfig): InternalArm[] {
  const byTier = new Map<ModelTier, ArmStat>()
  for (const s of stats) byTier.set(s.tier, s)

  // Compute raw rewards first (need the max to normalize into UCB1's [0,1] regime).
  const raw = MODEL_TIERS.map((tier) => {
    const base = byTier.get(tier) ?? { taskType: '', tier, pulls: 0, successes: 0, meanCostUsd: 0 }
    const isPrior = tier === priorTier
    const eff: ArmStat = isPrior
      ? { ...base, pulls: base.pulls + c.priorStrength, successes: base.successes + c.priorStrength }
      : base
    // No real evidence ⇒ no exploit value (avoids an unpriced/zero-cost arm looking
    // "infinitely cheap"); it is reached only via the UCB1 exploration bonus.
    const reward = base.pulls === 0 ? 0 : armReward(eff, c)
    return { tier, realPulls: base.pulls, effPulls: base.pulls + (isPrior ? c.priorStrength : 0), reward }
  })

  const maxReward = Math.max(...raw.map((a) => a.reward), Number.EPSILON)
  const totalEff = raw.reduce((acc, a) => acc + Math.max(a.effPulls, 1), 0)

  return raw.map((a) => ({
    ...a,
    ucb1: ucb1Score(a.reward / maxReward, a.effPulls, totalEff, c),
  }))
}

function toBreakdown(arms: InternalArm[]): ArmBreakdown[] {
  return arms.map((a) => ({ tier: a.tier, pulls: a.realPulls, reward: a.reward, ucb1: a.ucb1 }))
}

/**
 * Heuristic-prior cold-start + UCB1 selection among {cheap,build,frontier} for one
 * task type. `priorTier` is the static heuristic's choice (`tierForTask(kind)` /
 * `PHASE_TIER_MAP[phase]`). With fewer than `minObservations` TOTAL real pulls the
 * prior is returned verbatim (`source:'prior'`, byte-identical default). Otherwise the
 * arm with the highest UCB1 index wins; ties prefer the prior tier, then `MODEL_TIERS`
 * order. Deterministic — no `Math.random` on this path.
 */
export function recommendTier(stats: ArmStat[], priorTier: ModelTier, cfg?: Partial<BanditConfig>): TierRecommendation {
  const c = cfgWith(cfg)
  const arms = buildArms(stats, priorTier, c)
  const totalReal = arms.reduce((acc, a) => acc + a.realPulls, 0)

  if (totalReal < c.minObservations) {
    return { tier: priorTier, source: 'prior', score: 0, reason: 'cold-start', arms: toBreakdown(arms) }
  }

  if (c.algorithm === 'thompson') {
    // Deterministic default stays UCB1; thompson is only reachable via selectTierThompson.
    return recommendTier(stats, priorTier, { ...cfg, algorithm: 'ucb1' })
  }

  const chosen = argmaxArm(arms, priorTier)
  const exploit = argmaxBy(arms, (a) => a.reward, priorTier)
  const tied = arms.filter((a) => Math.abs(a.ucb1 - chosen.ucb1) < 1e-12).length > 1

  const reason: RecommendationReason = tied ? 'tie-break' : chosen.tier === exploit.tier ? 'exploit' : 'explore'

  return { tier: chosen.tier, source: 'learned', score: chosen.ucb1, reason, arms: toBreakdown(arms) }
}

/** Alias kept for the `model route --explain` surface; identical to {@link recommendTier}. */
export function explainTierChoice(
  stats: ArmStat[],
  priorTier: ModelTier,
  cfg?: Partial<BanditConfig>,
): TierRecommendation {
  return recommendTier(stats, priorTier, cfg)
}

function argmaxArm(arms: InternalArm[], priorTier: ModelTier): InternalArm {
  return argmaxBy(arms, (a) => a.ucb1, priorTier)
}

/** Argmax with deterministic tie-break: prefer the prior tier, then lowest tier index. */
function argmaxBy(arms: InternalArm[], score: (a: InternalArm) => number, priorTier: ModelTier): InternalArm {
  let best = arms[0]
  for (const a of arms) {
    const d = score(a) - score(best)
    if (d > 1e-12) {
      best = a
    } else if (Math.abs(d) <= 1e-12 && best.tier !== priorTier) {
      // tie: prefer the prior tier, otherwise keep the lower MODEL_TIERS index
      if (a.tier === priorTier || tierIndex(a.tier) < tierIndex(best.tier)) best = a
    }
  }
  return best
}

// ── Optional, seeded Thompson sampling (off by default; reproducible) ────────────

/** Deterministic 32-bit PRNG (mulberry32) — self-contained, for reproducible Thompson draws. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Gamma(k,1) draw via Marsaglia–Tsang (k≥1) with a boost for k<1; deterministic given `rng`. */
function gammaSample(k: number, rng: () => number): number {
  if (k < 1) {
    const u = Math.max(rng(), Number.EPSILON)
    return gammaSample(k + 1, rng) * Math.pow(u, 1 / k)
  }
  const d = k - 1 / 3
  const cc = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x: number
    let v: number
    do {
      // Box–Muller normal from two uniforms
      const u1 = Math.max(rng(), Number.EPSILON)
      const u2 = rng()
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
      v = 1 + cc * x
    } while (v <= 0)
    v = v * v * v
    const u = Math.max(rng(), Number.EPSILON)
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

/** Beta(α,β) draw from two Gamma draws; deterministic given `rng`. */
function betaSample(alpha: number, beta: number, rng: () => number): number {
  const x = gammaSample(alpha, rng)
  const y = gammaSample(beta, rng)
  return x / (x + y)
}

/**
 * OPTIONAL Beta-Bernoulli Thompson sampling — samples a success probability per arm
 * (prior tier gets `priorStrength` extra successes) and picks the arm maximizing the
 * sampled rate per unit cost. Reproducible via the `seed` (mulberry32). Cold-start
 * still defers to the prior. UCB1 remains the deterministic default.
 */
export function selectTierThompson(
  stats: ArmStat[],
  priorTier: ModelTier,
  seed: number,
  cfg?: Partial<BanditConfig>,
): TierRecommendation {
  const c = cfgWith(cfg)
  const arms = buildArms(stats, priorTier, c)
  const totalReal = arms.reduce((acc, a) => acc + a.realPulls, 0)
  if (totalReal < c.minObservations) {
    return { tier: priorTier, source: 'prior', score: 0, reason: 'cold-start', arms: toBreakdown(arms) }
  }

  const byTier = new Map<ModelTier, ArmStat>()
  for (const s of stats) byTier.set(s.tier, s)
  const rng = mulberry32(seed)

  let bestTier: ModelTier = priorTier
  let bestVal = -Infinity
  for (const tier of MODEL_TIERS) {
    const base = byTier.get(tier) ?? { taskType: '', tier, pulls: 0, successes: 0, meanCostUsd: 0 }
    const isPrior = tier === priorTier
    const succ = base.successes + (isPrior ? c.priorStrength : 0)
    const fail = Math.max(0, base.pulls - base.successes)
    const sampledRate = betaSample(succ + 1, fail + 1, rng)
    const cost = Math.max(base.meanCostUsd, c.costFloorUsd)
    const val = sampledRate / cost
    if (val > bestVal || (val === bestVal && (tier === priorTier || tierIndex(tier) < tierIndex(bestTier)))) {
      bestVal = val
      bestTier = tier
    }
  }
  const chosen = arms.find((a) => a.tier === bestTier)
  return { tier: bestTier, source: 'learned', score: chosen?.ucb1 ?? 0, reason: 'exploit', arms: toBreakdown(arms) }
}
