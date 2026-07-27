/*!
 * GA genome + fitness for ACO hyperparameter search (Task node_0c2812e4b4a6).
 *
 * WHY: MMAS evaporation (rho), pheromone influence (alpha), and bounds (tau)
 * are hand-tuned. A GA over these genes lets us discover better params from
 * episode history without manual sweeps.
 *
 * Encode/decode: flat number[] for crossover/mutation operators (GA-compatible).
 * Clamp: enforces AcoGenome ranges before evaluation.
 * Fitness: pure function — evaluator injected by caller (DIP, zero I/O here).
 *
 * Gene ranges: alpha ∈ [0.1, 5], rho ∈ [0, 1], tauMin ∈ [1e-4, 1], tauMax ∈ [0.5, 20].
 *
 * Composes with: mmas-pheromone.ts (consumers of rho/alpha), ope-evaluator.ts.
 */

export interface AcoGenome {
  /** Pheromone influence exponent α ∈ [0.1, 5]. */
  alpha: number
  /** Global evaporation rate ρ ∈ [0, 1]. */
  rho: number
  /** Minimum pheromone bound τ_min ∈ [1e-4, 1]. */
  tauMin: number
  /** Maximum pheromone bound τ_max ∈ [0.5, 20]. */
  tauMax: number
}

/** Evaluator injected by the caller — receives a genome, returns scalar fitness ∈ [0,1]. */
export type FitnessEvaluator = (genome: AcoGenome) => number

const GENE_ORDER: (keyof AcoGenome)[] = ['alpha', 'rho', 'tauMin', 'tauMax']

const GENE_RANGES: Record<keyof AcoGenome, [number, number]> = {
  alpha: [0.1, 5],
  rho: [0, 1],
  tauMin: [1e-4, 1],
  tauMax: [0.5, 20],
}

/** Encode genome into a flat number array (gene order: alpha, rho, tauMin, tauMax). */
export function encode(g: AcoGenome): number[] {
  return GENE_ORDER.map((k) => g[k])
}

/** Decode flat number array back into an AcoGenome (lossless). */
export function decode(genes: number[]): AcoGenome {
  const result = {} as AcoGenome
  for (let i = 0; i < GENE_ORDER.length; i++) {
    result[GENE_ORDER[i]!] = genes[i]!
  }
  return result
}

/** Clamp each gene to its valid range. Returns a new genome. */
export function clamp(g: AcoGenome): AcoGenome {
  const result = {} as AcoGenome
  for (const k of GENE_ORDER) {
    const [lo, hi] = GENE_RANGES[k]!
    result[k] = Math.min(hi, Math.max(lo, g[k]))
  }
  return result
}

/** Evaluate genome fitness via injected evaluator (pure, no I/O). */
export function fitness(g: AcoGenome, evaluator: FitnessEvaluator): number {
  return evaluator(g)
}
