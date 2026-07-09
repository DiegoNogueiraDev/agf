/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Monte Carlo delivery forecast — probabilistic completion dates (P50/P85/P95) by
 * bootstrap-resampling historical throughput.
 *
 * Anchor: Monte Carlo simulation (Metropolis–Ulam); the flow-forecasting practice of
 * #NoEstimates / Troy Magennis. Task throughput is over-dispersed count data, so the
 * parametric "linear regression + t-distribution CI" in `forecast.ts` assumes
 * Gaussian residuals it does not have. Instead we resample observed per-period
 * completions, simulate how many periods it takes to burn down the backlog, repeat
 * many times, and read percentiles — honest under real variability, no distributional
 * assumption. Deterministic given a seed (self-contained mulberry32), so it is
 * reproducible and unit-testable.
 */

export interface MonteCarloForecast {
  /** 50th-percentile delivery time (days): half the simulations finish by here. */
  p50Days: number
  /** 85th-percentile delivery time (days) — a common commitment line. */
  p85Days: number
  /** 95th-percentile delivery time (days) — conservative. */
  p95Days: number
  /** Simulations run. */
  iterations: number
}

export interface MonteCarloOptions {
  iterations?: number
  /** Seed for the deterministic PRNG (reproducible runs). */
  seed?: number
  /** Calendar days represented by one throughput sample (default 7 = weekly). */
  daysPerPeriod?: number
}

/** Deterministic 32-bit PRNG (mulberry32) — reproducible resampling. */
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

/** Nearest-rank percentile of an ascending-sorted array. p in [0,1]. */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const rank = Math.ceil(p * sortedAsc.length)
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, rank - 1))
  return sortedAsc[idx]
}

const MAX_PERIODS = 5000

/**
 * Simulate the number of days to complete `backlog` items by bootstrap-resampling the
 * observed `throughput` samples (items completed per period). Returns P50/P85/P95
 * delivery days. Backlog ≤ 0 ⇒ all zeros. Throughput with no positive sample ⇒ capped
 * at `MAX_PERIODS` periods (cannot burn down), so callers see a large, finite figure.
 */
export function monteCarloForecast(
  throughput: number[],
  backlog: number,
  opts: MonteCarloOptions = {},
): MonteCarloForecast {
  const iterations = Math.max(1, opts.iterations ?? 10_000)
  const daysPerPeriod = opts.daysPerPeriod ?? 7
  const seed = opts.seed ?? 1
  const samples = throughput.filter((t) => Number.isFinite(t))

  if (backlog <= 0 || samples.length === 0) {
    return { p50Days: 0, p85Days: 0, p95Days: 0, iterations }
  }

  const rng = mulberry32(seed)
  const days: number[] = new Array(iterations)
  for (let it = 0; it < iterations; it++) {
    let remaining = backlog
    let periods = 0
    while (remaining > 0 && periods < MAX_PERIODS) {
      const draw = samples[Math.floor(rng() * samples.length)]
      remaining -= Math.max(0, draw)
      periods += 1
    }
    days[it] = periods * daysPerPeriod
  }
  days.sort((a, b) => a - b)

  return {
    p50Days: percentile(days, 0.5),
    p85Days: percentile(days, 0.85),
    p95Days: percentile(days, 0.95),
    iterations,
  }
}
