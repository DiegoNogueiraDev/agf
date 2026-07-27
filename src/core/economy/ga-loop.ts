/*!
 * ga-loop — close the GA feedback loop: outcomes → fitness → evolve → apply.
 *
 * WHY: ga-driver + aco-genome exist but are only run manually via gate-cmd.
 * This module closes the loop: computes fitness from real ledger outcomes,
 * runs the GA, and applies the best genome if it beats the current baseline
 * (elitist best-so-far — never regress to a worse config).
 *
 * Deterministic via seeded LCG RNG — same seed = same genome.
 * Pure (no IO): caller queries the store and passes typed outcomes.
 *
 * Composes with: ga-driver.ts (evolve), aco-genome.ts (genome type),
 * mmas-pheromone.ts (consumer of alpha/rho/tauMin/tauMax).
 */

import { evolve } from './ga-driver.js'
import type { AcoGenome } from './aco-genome.js'
import { desirability } from '../colony/pheromone-weighted-select.js'
import { BETA } from './aco-params.js'
import type { SelectionEpisode } from './selection-quality.js'

export interface GaLoopOutcome {
  nodeId: string
  resolved: boolean
  costUsd: number
}

export interface GaLoopOptions {
  baseline: AcoGenome
  outcomes: GaLoopOutcome[]
  /**
   * Selection episodes (T6b). When present, fitness is genome→outcome ATTRIBUTION
   * via {@link replayFitness} — the real gradient — instead of the outcome-grounded
   * `genomeFitness` prior. This is the path the done tick feeds (T6c).
   */
  episodes?: SelectionEpisode[]
  generations?: number
  populationSize?: number
  seed?: number
  /** Override baseline fitness (0–1) for elitism comparison. Default: computed from the active signal. */
  baselineFitness?: number
}

export interface GaLoopResult {
  bestGenome: AcoGenome
  bestFitness: number
  /** True when bestFitness > baselineFitness and the genome was applied. */
  applied: boolean
}

/** Compute the outcome-grounded base fitness: resolveRate weighted by inverse mean cost. */
function fitnessFromOutcomes(outcomes: GaLoopOutcome[]): number {
  if (outcomes.length === 0) return 0
  const resolved = outcomes.filter((o) => o.resolved).length
  const resolveRate = resolved / outcomes.length
  const meanCost = outcomes.reduce((s, o) => s + o.costUsd, 0) / outcomes.length
  const costPenalty = Math.min(meanCost * 10, 1) // penalise high cost up to 1
  return Math.max(0, resolveRate - costPenalty * 0.1)
}

/** Gaussian bump ∈ (0,1], peaking at `mu`. Used to reward params in a healthy regime. */
function gaussian(x: number, mu: number, sigma: number): number {
  const d = x - mu
  return Math.exp(-(d * d) / (2 * sigma * sigma))
}

/**
 * Genome well-formedness ∈ (0,1]. Rewards valid, sensibly-tuned ACO params so the GA has a
 * gradient to climb; without this the fitness was constant across genomes (T4 bug).
 * - degenerate bounds (τ_min ≥ τ_max) are strongly penalised (but > 0 so the GA can escape);
 * - α peaks near 1 (balanced exploitation vs exploration), ρ near 0.1 (healthy evaporation).
 */
function genomeHealth(g: AcoGenome): number {
  if (g.tauMin >= g.tauMax) return 0.01
  return gaussian(g.alpha, 1.0, 1.5) * gaussian(g.rho, 0.1, 0.2)
}

/**
 * Genome-dependent fitness: outcome-grounded base × genome health. Two genomes with the same
 * outcomes but different params get different scores — the property the GA needs to optimise.
 */
export function genomeFitness(genome: AcoGenome, outcomes: GaLoopOutcome[]): number {
  return fitnessFromOutcomes(outcomes) * genomeHealth(genome)
}

/** Minimal validity guard: penalise degenerate bounds WITHOUT biasing α toward the
 *  default (unlike genomeHealth). Keeps the replay ranking the sole α gradient. */
function genomeValidity(g: AcoGenome): number {
  return g.tauMin < g.tauMax ? 1 : 0.01
}

/**
 * Genome→outcome attribution (T6b): replay each selection episode under the genome's α and
 * score how highly it would have ranked the realized target. Reuses the live roulette scorer
 * `τ^α · η^β` (desirability = η) so replay and selection agree. Fitness = mean reciprocal rank
 * of the target across episodes × validity guard.
 *
 * This is the gradient the defaults-centered `genomeHealth` prior could never give: a genome
 * whose α ranks the eventually-rewarded task higher scores strictly better, so the GA climbs
 * toward params that match real outcomes (not toward the defaults). Returns 0 (deterministic,
 * no throw) when there are no episodes to ground the signal.
 */
export function replayFitness(genome: AcoGenome, episodes: readonly SelectionEpisode[]): number {
  if (episodes.length === 0) return 0
  let sumReciprocalRank = 0
  for (const episode of episodes) {
    const scored = episode.candidates.map((c) => ({
      id: c.id,
      score: Math.pow(c.pheromone, genome.alpha) * Math.pow(desirability(c), BETA),
    }))
    scored.sort((a, b) => b.score - a.score)
    const rank = scored.findIndex((s) => s.id === episode.targetId) + 1
    sumReciprocalRank += rank > 0 ? 1 / rank : 0
  }
  return (sumReciprocalRank / episodes.length) * genomeValidity(genome)
}

/**
 * Run one GA epoch: evaluate outcomes → evolve → compare to baseline → apply if better.
 * Returns the best genome found and whether it was applied (fitness > baseline).
 */
export function runGaLoop(opts: GaLoopOptions): GaLoopResult {
  // Episode replay (T6b) is the real genome→outcome gradient; fall back to the
  // outcome-grounded prior (T4) only when no episodes are available.
  const useEpisodes = opts.episodes !== undefined && opts.episodes.length > 0
  const fitnessFn = (genome: AcoGenome): number =>
    useEpisodes ? replayFitness(genome, opts.episodes!) : genomeFitness(genome, opts.outcomes)

  // Baseline to beat: the caller's override, else the baseline genome's fitness under
  // the active signal (so "applied" means the evolved genome truly beat the defaults).
  const baselineFitness = opts.baselineFitness ?? (useEpisodes ? replayFitness(opts.baseline, opts.episodes!) : 0)

  const result = evolve(fitnessFn, {
    generations: opts.generations ?? 10,
    populationSize: opts.populationSize ?? 20,
    seed: opts.seed ?? 0,
  })

  const applied = result.best.fitness > baselineFitness

  return {
    bestGenome: result.best.genome,
    bestFitness: result.best.fitness,
    applied,
  }
}
