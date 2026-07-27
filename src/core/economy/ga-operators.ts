/*!
 * GA operators: tournament selection, blend crossover, Gaussian mutation.
 * Task node_45aa9fce2815.
 *
 * WHY: the ACO hyperparameter GA needs deterministic operators (seeded PRNG)
 * so experiments are reproducible and results can be compared across runs.
 *
 * PRNG: xorshift32 seeded from opts.seed — no Date.now(), no Math.random().
 * Bounds: clamp() from aco-genome.ts enforces gene ranges post-mutation.
 *
 * Composes with: aco-genome.ts (AcoGenome, clamp), learning-precision.ts (fitness source).
 */

import { clamp, type AcoGenome } from './aco-genome.js'

export interface Individual {
  genome: AcoGenome
  fitness: number
}

export interface TournamentOpts {
  tournamentSize?: number
  seed: number
}

export interface CrossoverOpts {
  seed: number
}

export interface MutateOpts {
  seed: number
  /** Probability [0,1] each gene mutates. Default 0.2. */
  rate?: number
  /** Std dev of Gaussian noise added to a gene (fraction of range). Default 0.05. */
  sigma?: number
}

/** xorshift32 seeded PRNG — returns values in [0,1). */
function makePrng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 0x100000000
  }
}

/**
 * Tournament selection: pick `tournamentSize` individuals at random,
 * return the one with highest fitness. Reproducible with same seed.
 */
export function tournamentSelect(population: Individual[], opts: TournamentOpts): Individual {
  const size = opts.tournamentSize ?? 3
  const rand = makePrng(opts.seed)
  const actual = Math.min(size, population.length)
  let best = population[Math.floor(rand() * population.length)]!
  for (let i = 1; i < actual; i++) {
    const candidate = population[Math.floor(rand() * population.length)]!
    if (candidate.fitness > best.fitness) best = candidate
  }
  return best
}

/**
 * Blend crossover: for each gene, child value is drawn uniformly from
 * [min(a,b), max(a,b)] (convex envelope). Clamps result to gene ranges.
 */
export function blendCrossover(a: AcoGenome, b: AcoGenome, opts: CrossoverOpts): AcoGenome {
  const rand = makePrng(opts.seed)
  const keys: (keyof AcoGenome)[] = ['alpha', 'rho', 'tauMin', 'tauMax']
  const child = {} as AcoGenome
  for (const k of keys) {
    const lo = Math.min(a[k], b[k])
    const hi = Math.max(a[k], b[k])
    child[k] = lo + rand() * (hi - lo)
  }
  return clamp(child)
}

const GENE_RANGES: Record<keyof AcoGenome, [number, number]> = {
  alpha: [0.1, 5],
  rho: [0, 1],
  tauMin: [1e-4, 1],
  tauMax: [0.5, 20],
}

/**
 * Gaussian mutation: for each gene, apply noise with probability `rate`.
 * Noise = N(0, sigma * range). Clamps to gene ranges.
 */
export function mutate(g: AcoGenome, opts: MutateOpts): AcoGenome {
  const rate = opts.rate ?? 0.2
  const sigma = opts.sigma ?? 0.05
  const rand = makePrng(opts.seed)
  const keys: (keyof AcoGenome)[] = ['alpha', 'rho', 'tauMin', 'tauMax']
  const result = { ...g }
  for (const k of keys) {
    if (rand() < rate) {
      const [lo, hi] = GENE_RANGES[k]!
      const noise = gaussianNoise(rand) * sigma * (hi - lo)
      result[k] = g[k] + noise
    }
  }
  return clamp(result)
}

/** Box-Muller transform using two uniform samples from the PRNG. */
export function gaussianNoise(rand: () => number): number {
  const u1 = Math.max(1e-10, rand())
  const u2 = rand()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}
