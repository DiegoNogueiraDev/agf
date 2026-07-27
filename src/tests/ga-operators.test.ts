/*!
 * Task node_45aa9fce2815 — GA operators: tournament / crossover / mutation.
 *
 * AC1: tournamentSelect picks highest-fitness individual reproducibly with seed
 * AC2: blendCrossover genes land in convex envelope [min(Ai,Bi), max(Ai,Bi)]
 * AC3: mutate with same seed twice → identical result, genes within bounds
 */

import { describe, it, expect } from 'vitest'
import { tournamentSelect, blendCrossover, mutate, type Individual } from '../core/economy/ga-operators.js'
import type { AcoGenome } from '../core/economy/aco-genome.js'

function makeIndividual(alpha: number, fitness: number): Individual {
  return { genome: { alpha, rho: 0.1, tauMin: 0.01, tauMax: 5 }, fitness }
}

describe('tournamentSelect', () => {
  it('picks the individual with highest fitness from the tournament (AC1)', () => {
    const pop: Individual[] = [makeIndividual(1, 0.3), makeIndividual(2, 0.9), makeIndividual(3, 0.5)]
    const selected = tournamentSelect(pop, { tournamentSize: 3, seed: 42 })
    expect(selected.fitness).toBe(0.9)
  })

  it('is reproducible with the same seed', () => {
    const pop: Individual[] = Array.from({ length: 10 }, (_, i) => makeIndividual(i, Math.sin(i) * 0.5 + 0.5))
    const a = tournamentSelect(pop, { seed: 7 })
    const b = tournamentSelect(pop, { seed: 7 })
    expect(a.genome).toEqual(b.genome)
  })
})

describe('blendCrossover', () => {
  it('each gene is within convex envelope of parents (AC2)', () => {
    const parentA: AcoGenome = { alpha: 1, rho: 0.2, tauMin: 0.05, tauMax: 3 }
    const parentB: AcoGenome = { alpha: 3, rho: 0.8, tauMin: 0.1, tauMax: 10 }
    const child = blendCrossover(parentA, parentB, { seed: 99 })
    for (const key of ['alpha', 'rho', 'tauMin', 'tauMax'] as const) {
      const lo = Math.min(parentA[key], parentB[key])
      const hi = Math.max(parentA[key], parentB[key])
      expect(child[key]).toBeGreaterThanOrEqual(lo - 1e-9)
      expect(child[key]).toBeLessThanOrEqual(hi + 1e-9)
    }
  })
})

describe('mutate', () => {
  it('same seed produces identical result twice (AC3)', () => {
    const g: AcoGenome = { alpha: 2, rho: 0.3, tauMin: 0.02, tauMax: 7 }
    const r1 = mutate(g, { seed: 13 })
    const r2 = mutate(g, { seed: 13 })
    expect(r1).toEqual(r2)
  })

  it('mutated genes respect AcoGenome bounds (AC3)', () => {
    const g: AcoGenome = { alpha: 2, rho: 0.3, tauMin: 0.02, tauMax: 7 }
    const mutated = mutate(g, { seed: 1, rate: 1.0 })
    expect(mutated.alpha).toBeGreaterThanOrEqual(0.1)
    expect(mutated.alpha).toBeLessThanOrEqual(5)
    expect(mutated.rho).toBeGreaterThanOrEqual(0)
    expect(mutated.rho).toBeLessThanOrEqual(1)
  })
})
