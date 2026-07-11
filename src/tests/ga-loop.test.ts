/*!
 * TDD: GA loop — outcome→fitness→apply auto-tune (node_d5ffebfd48e6).
 *
 * AC1: GA loop evolves AcoGenome with fitness >= baseline and applies it.
 * AC2: Worse genome is NOT applied (elitist: best-so-far wins).
 * AC3: Seeded RNG → deterministic (same seed = same result).
 */

import { describe, it, expect } from 'vitest'
import { runGaLoop, genomeFitness, replayFitness, type GaLoopOutcome } from '../core/economy/ga-loop.js'
import type { AcoGenome } from '../core/economy/aco-genome.js'
import type { SelectionEpisode } from '../core/economy/selection-quality.js'

const BASELINE: AcoGenome = { alpha: 1.0, rho: 0.1, tauMin: 0.01, tauMax: 5.0 }

function makeOutcomes(resolveRate: number): GaLoopOutcome[] {
  return Array.from({ length: 5 }, (_, i) => ({
    nodeId: `n${i}`,
    resolved: resolveRate > 0.5,
    costUsd: 0.001,
  }))
}

describe('AC1: GA evolves genome with fitness >= baseline and applies it', () => {
  it('returns applied=true when evolved genome is better than baseline', () => {
    const outcomes = makeOutcomes(0.9) // high resolve rate → high fitness
    const result = runGaLoop({ baseline: BASELINE, outcomes, generations: 5, seed: 42 })
    expect(result.applied).toBe(true)
    expect(result.bestGenome).toBeDefined()
    expect(result.bestFitness).toBeGreaterThanOrEqual(0)
  })
})

describe('AC2: worse genome is NOT applied (elitism)', () => {
  it('returns applied=false when no outcome data (fitness 0 < baseline fitness)', () => {
    const result = runGaLoop({
      baseline: BASELINE,
      outcomes: [],
      generations: 3,
      seed: 1,
      baselineFitness: 0.9, // high baseline — random genome with 0 outcomes can't beat it
    })
    expect(result.applied).toBe(false)
  })
})

describe('AC3: seeded RNG is deterministic', () => {
  it('same seed produces identical bestGenome', () => {
    const outcomes = makeOutcomes(0.8)
    const r1 = runGaLoop({ baseline: BASELINE, outcomes, generations: 5, seed: 99 })
    const r2 = runGaLoop({ baseline: BASELINE, outcomes, generations: 5, seed: 99 })
    expect(r1.bestGenome).toEqual(r2.bestGenome)
    expect(r1.bestFitness).toBe(r2.bestFitness)
  })
})

// T4 (node_fdc9c31b7bf0): the fitness MUST depend on the genome — previously the fitness
// function ignored its argument, so the GA could not discriminate good params from bad.
describe('T4: genomeFitness depends on the genome', () => {
  const outcomes = makeOutcomes(0.9) // resolved → positive base fitness

  it('two ranking-divergent genomes get different fitness (same outcomes)', () => {
    const healthy: AcoGenome = { alpha: 1.0, rho: 0.1, tauMin: 0.01, tauMax: 5.0 }
    const extreme: AcoGenome = { alpha: 5.0, rho: 0.9, tauMin: 0.01, tauMax: 5.0 }
    expect(genomeFitness(healthy, outcomes)).not.toBe(genomeFitness(extreme, outcomes))
  })

  it('a healthy genome scores higher than one with degenerate bounds (tauMin >= tauMax)', () => {
    const healthy: AcoGenome = { alpha: 1.0, rho: 0.1, tauMin: 0.01, tauMax: 5.0 }
    const degenerate: AcoGenome = { alpha: 1.0, rho: 0.1, tauMin: 5.0, tauMax: 5.0 }
    expect(genomeFitness(healthy, outcomes)).toBeGreaterThan(genomeFitness(degenerate, outcomes))
  })

  it('is 0 for any genome when there are no outcomes (nothing to ground the base signal)', () => {
    const g: AcoGenome = { alpha: 1.0, rho: 0.1, tauMin: 0.01, tauMax: 5.0 }
    expect(genomeFitness(g, [])).toBe(0)
  })
})

// T6b (node_a3635093fdf7): genome→outcome attribution by replaying selection episodes.
// The target ('t') has HIGH pheromone but LOW desirability; the competitor ('c') the
// opposite. So a HIGHER α (weighting τ more) ranks the realized target first — the
// gradient points AWAY from the default α, which the defaults-centered T4 prior could
// never provide.
describe('T6b: replayFitness attributes outcomes to genomes via episode replay', () => {
  const episodes: SelectionEpisode[] = [
    {
      candidates: [
        { id: 't', priority: 2, size: 2, blockingImpact: 0, acCount: 0, pheromone: 10 },
        { id: 'c', priority: 1, size: 1, blockingImpact: 5, acCount: 4, pheromone: 1 },
      ],
      targetId: 't',
    },
  ]

  it('two genomes that rank the target differently get different fitness', () => {
    const lowAlpha: AcoGenome = { alpha: 1.0, rho: 0.1, tauMin: 0.01, tauMax: 5.0 }
    const highAlpha: AcoGenome = { alpha: 5.0, rho: 0.1, tauMin: 0.01, tauMax: 5.0 }
    expect(replayFitness(lowAlpha, episodes)).not.toBe(replayFitness(highAlpha, episodes))
    // higher α ranks the high-τ target first → strictly better replay fitness
    expect(replayFitness(highAlpha, episodes)).toBeGreaterThan(replayFitness(lowAlpha, episodes))
  })

  it('penalises degenerate bounds (tauMin >= tauMax) without biasing α toward the default', () => {
    const valid: AcoGenome = { alpha: 5.0, rho: 0.1, tauMin: 0.01, tauMax: 5.0 }
    const degenerate: AcoGenome = { alpha: 5.0, rho: 0.1, tauMin: 5.0, tauMax: 5.0 }
    expect(replayFitness(valid, episodes)).toBeGreaterThan(replayFitness(degenerate, episodes))
  })

  it('is 0 for any genome when there are no episodes (deterministic, no throw)', () => {
    const g: AcoGenome = { alpha: 1.0, rho: 0.1, tauMin: 0.01, tauMax: 5.0 }
    expect(replayFitness(g, [])).toBe(0)
  })

  it('runGaLoop over episodes evolves a best genome with α ≠ default and fitness > baseline', () => {
    const baseline: AcoGenome = { alpha: 1.0, rho: 0.1, tauMin: 0.01, tauMax: 5.0 }
    const r = runGaLoop({ baseline, outcomes: [], episodes, generations: 8, seed: 7 })
    expect(r.applied).toBe(true)
    expect(r.bestGenome.alpha).not.toBe(1.0)
    expect(r.bestFitness).toBeGreaterThan(replayFitness(baseline, episodes))
  })
})
