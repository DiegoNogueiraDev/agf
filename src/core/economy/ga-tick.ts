/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * ga-tick — adapter that runs the GA autotune loop on the done tick and persists
 * the evolved genome into the aco_autotune lever, so the NEXT `agf next --aco`
 * selects with learned params. This is what turns the whole ACO/GA chain from
 * "built" into "used": episodes (T6a) → replay fitness (T6b) → tuned α/β/ρ here.
 *
 * Mirrors stagnation-tick.ts: gated behind the aco_autotune lever (default OFF =
 * byte-identical), plus a cold-start guard (needs ≥ minEpisodes to avoid tuning on
 * noise — RISK node_0ebddf353fd8). Never throws: a GA failure must not break `done`.
 *
 * Composes with: ga-loop.ts (evolve), selection-quality.ts (episodes),
 *   economy-levers-config.ts (persist), done-cmd.ts (call site).
 */

import type Database from 'better-sqlite3'
import { runGaLoop } from './ga-loop.js'
import { readSelectionEpisodes } from './selection-quality.js'
import { resolveEconomyLeversConfig, getLeverParams, setLeverParam } from './economy-levers-config.js'
import { ALPHA, RHO, TAU_MIN, TAU_MAX } from './aco-params.js'
import type { AcoGenome } from './aco-genome.js'

/** Below this many episodes the GA would overfit noise → skip (cold-start guard). */
const DEFAULT_MIN_EPISODES = 20

/** The store surface ga-tick needs: the DB + the lever config read/write. */
export interface GaTickStore {
  getDb(): Database.Database
  getProject(): { id: string } | null
  getProjectSetting(key: string): string | null
  setProjectSetting(key: string, value: string): void
}

export interface GaTickOpts {
  /**
   * Opt-out escape hatch. Smart-default is ON (regra 16): the tick auto-engages once there
   * are enough episodes, so the built GA actually delivers value in the consumer's default
   * mode — no lever to flip. Set `disabled:true` to force a byte-identical no-op.
   */
  disabled?: boolean
  /** Minimum episodes before tuning is allowed (default 20). */
  minEpisodes?: number
  /** Seed for deterministic evolution. */
  seed?: number
}

export interface GaTickResult {
  ran: boolean
  applied: boolean
  reason: 'disabled' | 'cold-start' | 'applied' | 'not-better' | 'error'
  bestGenome?: AcoGenome
}

/**
 * Run one GA autotune tick. Reads selection episodes, evolves the aco_autotune genome
 * from its current persisted params, and persists the result only when it beats the
 * baseline. Best-effort: a failure returns `{ran:false, reason:'error'}` — the caller's
 * `done` must complete regardless.
 */
export function runGaTick(store: GaTickStore, opts: GaTickOpts = {}): GaTickResult {
  if (opts.disabled === true) return { ran: false, applied: false, reason: 'disabled' }
  try {
    const db = store.getDb()
    const projectId = store.getProject()?.id ?? ''
    const minEpisodes = opts.minEpisodes ?? DEFAULT_MIN_EPISODES
    const episodes = readSelectionEpisodes(db, projectId)
    if (episodes.length < minEpisodes) return { ran: false, applied: false, reason: 'cold-start' }

    const params = getLeverParams(resolveEconomyLeversConfig(store), 'aco_autotune')
    const baseline: AcoGenome = {
      alpha: params.alpha ?? ALPHA,
      rho: params.rho ?? RHO,
      tauMin: params.tauMin ?? TAU_MIN,
      tauMax: params.tauMax ?? TAU_MAX,
    }
    const result = runGaLoop({ baseline, outcomes: [], episodes, seed: opts.seed ?? 0 })
    if (result.applied) {
      const g = result.bestGenome
      setLeverParam(store, 'aco_autotune', 'alpha', g.alpha)
      setLeverParam(store, 'aco_autotune', 'rho', g.rho)
      setLeverParam(store, 'aco_autotune', 'tauMin', g.tauMin)
      setLeverParam(store, 'aco_autotune', 'tauMax', g.tauMax)
    }
    return {
      ran: true,
      applied: result.applied,
      reason: result.applied ? 'applied' : 'not-better',
      bestGenome: result.bestGenome,
    }
  } catch {
    return { ran: false, applied: false, reason: 'error' }
  }
}
