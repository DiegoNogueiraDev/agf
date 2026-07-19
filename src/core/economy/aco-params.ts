/*!
 * aco-params — single source of truth for all ACO/MMAS numeric parameters.
 *
 * WHY: DECAY_RATE (pheromone-decay.ts) and DEFAULT_EVAPORATION_RATE (pheromone-memory.ts)
 * were duplicated at 0.05; TAU_MIN=0.1 in mmas-pheromone.ts diverged from the aco_autotune
 * lever default of tauMin=0.01 in economy-levers-config.ts. Centralising here ensures a
 * single edit point and no silent divergence.
 *
 * Composes with: mmas-pheromone.ts, pheromone-decay.ts, pheromone-memory.ts,
 *                economy-levers-config.ts — all import from here.
 */

/** Global evaporation / decay rate (ρ). Used by pheromone-decay and pheromone-memory. */
export const DEFAULT_EVAPORATION_RATE = 0.05

/** MMAS τ_min — minimum trail strength (clamped lower bound). */
export const TAU_MIN = 0.01

/** MMAS τ_max — maximum trail strength. */
export const TAU_MAX = 5.0

/** ACO pheromone influence exponent (α). */
export const ALPHA = 1.0

/** ACO heuristic influence exponent (β). */
export const BETA = 2.0

/** GA-evolved global evaporation rate used by MMAS (ρ). */
export const RHO = 0.1
