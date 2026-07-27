/*!
 * GA driver: evolve a population of AcoGenomes for N generations → best.
 * Task node_a44527442b29.
 *
 * WHY: wraps the GA operators (tournament / crossover / mutation) into a
 * standard generational loop with elitism and a monotonic bestFitness history.
 * Zero LLM calls — the fitness evaluator is injected by the caller (DIP).
 *
 * Elitism: carry the top `elitism` individuals unchanged into the next generation
 * so bestFitness is guaranteed monotonically non-decreasing.
 *
 * Composes with: ga-operators.ts, aco-genome.ts.
 */

import { clamp, type AcoGenome, type FitnessEvaluator } from './aco-genome.js'
import { tournamentSelect, blendCrossover, mutate, type Individual } from './ga-operators.js'
import { makeSeededPrng } from '../utils/seeded-prng.js'

export interface EvolveOptions {
  populationSize: number
  generations: number
  /** Number of top individuals carried unchanged to next generation. Default 1. */
  elitism?: number
  seed: number
  /** Tournament size for selection. Default 3. */
  tournamentSize?: number
  /** Mutation rate per gene. Default 0.2. */
  mutationRate?: number
}

export interface EvolveResult {
  best: Individual
  /** Best fitness value at each generation (length = generations + 1). */
  history: number[]
}

// Seeded xorshift32 PRNG lives in the shared util so GA and ACO selection stay in sync.
const makePrng = makeSeededPrng

/** Initial random genome within gene ranges. */
function randomGenome(rand: () => number): AcoGenome {
  return clamp({
    alpha: 0.1 + rand() * 4.9,
    rho: rand(),
    tauMin: 1e-4 + rand() * 0.9999,
    tauMax: 0.5 + rand() * 19.5,
  })
}

/** Evolve a population for N generations and return the best genome found. */
export function evolve(evaluator: FitnessEvaluator, opts: EvolveOptions): EvolveResult {
  const { populationSize, generations, seed } = opts
  const elitism = opts.elitism ?? 1
  const tournamentSize = opts.tournamentSize ?? 3
  const mutationRate = opts.mutationRate ?? 0.2

  const rand = makePrng(seed)

  // Initialise population
  let population: Individual[] = Array.from({ length: populationSize }, () => {
    const genome = randomGenome(rand)
    return { genome, fitness: evaluator(genome) }
  })

  population.sort((a, b) => b.fitness - a.fitness)

  const history: number[] = [population[0]!.fitness]

  for (let g = 0; g < generations; g++) {
    const nextGen: Individual[] = population.slice(0, elitism)

    while (nextGen.length < populationSize) {
      const seedA = (rand() * 0x7fffffff) | 0
      const seedB = (rand() * 0x7fffffff) | 0
      const seedC = (rand() * 0x7fffffff) | 0
      const seedD = (rand() * 0x7fffffff) | 0

      const parentA = tournamentSelect(population, { tournamentSize, seed: seedA })
      const parentB = tournamentSelect(population, { tournamentSize, seed: seedB })
      const child = blendCrossover(parentA.genome, parentB.genome, { seed: seedC })
      const mutated = mutate(child, { seed: seedD, rate: mutationRate })
      nextGen.push({ genome: mutated, fitness: evaluator(mutated) })
    }

    nextGen.sort((a, b) => b.fitness - a.fitness)
    population = nextGen
    history.push(population[0]!.fitness)
  }

  return { best: population[0]!, history }
}
