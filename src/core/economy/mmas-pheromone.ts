/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * MAX-MIN Ant System (MMAS, Stützle & Hoos 2000) control rules layered on top of
 * the base {@link ./pheromone-store pheromone trail store}.
 *
 * WHY a separate module: the base store owns trail CRUD + continuous `e^{-λt}`
 * time-decay (its single responsibility). MMAS adds a distinct, iteration-based
 * control discipline — bounded pheromone (`τ ∈ [τ_min, τ_max]` to avoid premature
 * convergence), explicit global evaporation `ρ`, ACS local decay `ξ` on selection,
 * elitist reinforcement of the best-so-far, and stagnation recovery via the
 * normalized entropy of the τ distribution. Keeping it here lets the store stay
 * lever-agnostic while MMAS reuses the same `pheromone_trails` table (EXPAND, not
 * recreate). All functions are pure data access — opt-in at the call sites.
 *
 * §ADR-deterministic-first — no clocks beyond the injectable `nowMs`, no randomness.
 */

import type Database from 'better-sqlite3'
import { depositPheromone, strongestPheromones, PHEROMONE_HALF_LIFE_MS } from './pheromone-store.js'

export { TAU_MIN, TAU_MAX, RHO } from './aco-params.js'
import { TAU_MIN, TAU_MAX, RHO } from './aco-params.js'
import { recordBestSoFar } from './best-so-far-store.js'
/** ACS local-decay factor applied to a trail when it is selected. */
export const XI = 0.1
/** Elitist weight: the best-so-far trail is reinforced `e×` the base deposit. */
export const ELITE_WEIGHT = 2.0
/** Normalized-entropy floor below which the colony is stagnant and must reset. */
export const STAGNATION_THRESHOLD = 0.3
/** Normalized-entropy ceiling above which the colony is too diffuse (over-exploring). */
export const DIFFUSE_MAX = 0.85
/** Baseline pheromone-importance exponent α for selection. */
export const ALPHA_BASE = 1.0
/** Temporarily raised α when diffuse — sharpens exploitation to re-focus the search. */
export const ALPHA_DIFFUSE = 2.0

/** Clamp a pheromone value into the MMAS band `[τ_min, τ_max]`. */
export function clampTau(tau: number, tauMin: number = TAU_MIN, tauMax: number = TAU_MAX): number {
  return Math.min(tauMax, Math.max(tauMin, tau))
}

/** Uma linha crua da pheromone_trails — sem decay/epsilon/cap aplicados. */
export interface PheromoneTrailRow {
  readonly key: string
  readonly amount: number
  readonly ts: number
}

/**
 * Reader CRU das trilhas de um projeto (node_7e38f5531fc8) — data-source do
 * contract node_c8b85a2b9c29. Difere de strongestPheromones (pheromone-store):
 * aqui NÃO há decay, epsilon nem cap — é o estado armazenado, ordenado por
 * amount desc. Nunca lança: falha de query (db fechado, tabela ausente) ⇒ [].
 */
export function listPheromoneTrails(db: Database.Database, projectId: string): readonly PheromoneTrailRow[] {
  try {
    return db
      .prepare('SELECT key, amount, ts FROM pheromone_trails WHERE project_id = ? ORDER BY amount DESC')
      .all(projectId) as PheromoneTrailRow[]
  } catch {
    // Reader tolerante por contrato (AC4): sem tabela/db utilizável ⇒ [].
    return []
  }
}

/** Opções do merge de trilha importada (federação — node_7ec4aef641d0). */
export interface MergeImportedTauOptions {
  /** Injetável p/ determinismo. */
  nowMs?: number
  /** Peso da fonte externa (0..1] — trilha herdada nunca entra com força cheia. */
  sourceWeight?: number
  /** Meia-vida do decay por idade da trilha (ms). */
  halfLifeMs?: number
}

const DEFAULT_SOURCE_WEIGHT = 0.5
const DEFAULT_IMPORT_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Merge MMAS de uma trilha IMPORTADA (federação): desconto por idade
 * (meia-vida) + peso de fonte, clamp em [τ_min, τ_max], e a regra de ouro —
 * NUNCA rebaixa uma trilha local mais forte (max-merge). Idempotente: o mesmo
 * bundle re-importado produz o mesmo τ descontado, que nunca supera o local
 * já gravado. Retorna true somente quando escreveu.
 */
export function mergeImportedTau(
  db: Database.Database,
  projectId: string,
  imported: { key: string; amount: number; ts: number },
  opts: MergeImportedTauOptions = {},
): boolean {
  const nowMs = opts.nowMs ?? Date.now()
  const halfLifeMs = opts.halfLifeMs ?? DEFAULT_IMPORT_HALF_LIFE_MS
  const sourceWeight = opts.sourceWeight ?? DEFAULT_SOURCE_WEIGHT
  const ageMs = Math.max(0, nowMs - imported.ts)
  const decayed = imported.amount * Math.pow(0.5, ageMs / halfLifeMs) * sourceWeight
  const tau = clampTau(decayed)
  const local = readTau(db, projectId, imported.key)
  if (local >= tau) return false
  writeTau(db, projectId, imported.key, tau, nowMs)
  return true
}

/** Read the raw stored τ for a key (0 when absent). */
function readTau(db: Database.Database, projectId: string, key: string): number {
  const row = db.prepare('SELECT amount FROM pheromone_trails WHERE project_id = ? AND key = ?').get(projectId, key) as
    { amount: number } | undefined
  return row ? row.amount : 0
}

/** Upsert a raw τ value for a key (used by the bounded mutations below). */
function writeTau(db: Database.Database, projectId: string, key: string, tau: number, nowMs: number): void {
  db.prepare(
    `INSERT INTO pheromone_trails (project_id, key, amount, ts)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(project_id, key) DO UPDATE SET amount = excluded.amount, ts = excluded.ts`,
  ).run(projectId, key, tau, nowMs)
}

/**
 * Deposit reinforcement on a trail, then clamp the resulting τ into `[τ_min, τ_max]`.
 * Reuses the base store's evaporate-then-add semantics; the clamp is the MMAS rule.
 * Returns the bounded τ now stored.
 */
export function mmasDeposit(
  db: Database.Database,
  projectId: string,
  key: string,
  amount: number,
  nowMs: number = Date.now(),
  tauMin: number = TAU_MIN,
  tauMax: number = TAU_MAX,
  halfLifeMs: number = PHEROMONE_HALF_LIFE_MS,
): number {
  depositPheromone(db, projectId, key, amount, nowMs, halfLifeMs)
  const clamped = clampTau(readTau(db, projectId, key), tauMin, tauMax)
  db.prepare('UPDATE pheromone_trails SET amount = ? WHERE project_id = ? AND key = ?').run(clamped, projectId, key)
  return clamped
}

/**
 * Global evaporation (MMAS, applied once after deposits): `τ ← max(τ_min, (1-ρ)·τ)`
 * for every trail in the project. Floored at `τ_min` so no trail dies completely.
 * Returns the number of trails affected.
 */
export function globalEvaporation(
  db: Database.Database,
  projectId: string,
  rho: number = RHO,
  tauMin: number = TAU_MIN,
): number {
  const res = db
    .prepare('UPDATE pheromone_trails SET amount = MAX(?, amount * (1 - ?)) WHERE project_id = ?')
    .run(tauMin, rho, projectId)
  return res.changes
}

/**
 * ACS local decay applied when a trail is selected: `τ ← (1-ξ)·τ + ξ·τ_min`, clamped.
 * Nudges a just-used trail toward `τ_min` so the colony keeps exploring alternatives.
 * Returns the new bounded τ.
 */
export function localDecay(
  db: Database.Database,
  projectId: string,
  key: string,
  xi: number = XI,
  tauMin: number = TAU_MIN,
  tauMax: number = TAU_MAX,
  nowMs: number = Date.now(),
): number {
  const cur = readTau(db, projectId, key) || tauMin
  const next = clampTau((1 - xi) * cur + xi * tauMin, tauMin, tauMax)
  writeTau(db, projectId, key, next, nowMs)
  return next
}

/**
 * Elitist reinforcement: lay down `e·amount` on the best-so-far trail (clamped to
 * `τ_max`). A thin wrapper over {@link mmasDeposit} — the bounding is shared.
 */
export function elitistReinforce(
  db: Database.Database,
  projectId: string,
  bestKey: string,
  amount: number,
  e: number = ELITE_WEIGHT,
  nowMs: number = Date.now(),
  tauMin: number = TAU_MIN,
  tauMax: number = TAU_MAX,
  halfLifeMs: number = PHEROMONE_HALF_LIFE_MS,
): number {
  return mmasDeposit(db, projectId, bestKey, e * amount, nowMs, tauMin, tauMax, halfLifeMs)
}

/**
 * Normalized Shannon entropy of a τ distribution: `H_norm = -Σ pᵢ·ln(pᵢ) / ln(N)`,
 * with `pᵢ = τᵢ / Στ` over the `N` positive trails. Pure.
 * Returns 1 for a uniform distribution (max diversity), 0 for a single/empty
 * distribution (full concentration → stagnation).
 */
export function normalizedEntropy(strengths: readonly number[]): number {
  const positive = strengths.filter((s) => s > 0)
  const n = positive.length
  if (n <= 1) return 0
  const total = positive.reduce((sum, s) => sum + s, 0)
  if (total <= 0) return 0
  let h = 0
  for (const s of positive) {
    const p = s / total
    h -= p * Math.log(p)
  }
  return h / Math.log(n)
}

/**
 * Normalized entropy of the colony's current (evaporated) trail strengths.
 * Low values mean a few trails dominate — the stagnation signal for {@link isStagnant}.
 */
export function colonyEntropy(
  db: Database.Database,
  projectId: string,
  nowMs: number = Date.now(),
  halfLifeMs: number = PHEROMONE_HALF_LIFE_MS,
): number {
  const strengths = strongestPheromones(db, projectId, Number.MAX_SAFE_INTEGER, nowMs, halfLifeMs).map(
    (p) => p.strength,
  )
  return normalizedEntropy(strengths)
}

/** True when normalized entropy has fallen below the stagnation floor. */
export function isStagnant(hNorm: number, threshold: number = STAGNATION_THRESHOLD): boolean {
  return hNorm < threshold
}

/**
 * MMAS reset: set every trail to `τ_max` to re-diversify after stagnation. This is
 * the recovery the original MMAS prescribes when the search has converged too far.
 * Returns the number of trails reset.
 */
export function mmasReset(
  db: Database.Database,
  projectId: string,
  tauMax: number = TAU_MAX,
  nowMs: number = Date.now(),
): number {
  const res = db
    .prepare('UPDATE pheromone_trails SET amount = ?, ts = ? WHERE project_id = ?')
    .run(tauMax, nowMs, projectId)
  return res.changes
}

// ── Phase-6 stagnation controller ───────────────────────────────────────────────

/** The three diversity regimes a colony's pheromone entropy can fall into. */
export type ColonyBand = 'stagnant' | 'healthy' | 'diffuse'
/** What the controller decides to do for each band. */
export type StagnationAction = 'reset' | 'continue' | 'boost_alpha'

/** The controller's verdict — the band, the action taken, and the α to select with next. */
export interface StagnationDecision {
  hNorm: number
  band: ColonyBand
  action: StagnationAction
  /** Recommended pheromone-importance exponent for the next selection round. */
  alpha: number
  /** Trails reset to τ_max (>0 only when a stagnation reset fired). */
  trailsReset: number
  /**
   * The best-so-far champion key captured just before a reset wiped the field
   * (elitist memory). Present only on a `reset` action; undefined otherwise.
   */
  bestKey?: string
}

/**
 * Classify normalized entropy into an MMAS diversity band (pure):
 * `< stagnantBelow` → stagnant (converged), `> diffuseAbove` → diffuse (over-exploring),
 * otherwise healthy. Boundaries belong to the healthy band.
 */
export function classifyEntropy(
  hNorm: number,
  stagnantBelow: number = STAGNATION_THRESHOLD,
  diffuseAbove: number = DIFFUSE_MAX,
): ColonyBand {
  if (hNorm < stagnantBelow) return 'stagnant'
  if (hNorm > diffuseAbove) return 'diffuse'
  return 'healthy'
}

/** Options for {@link stagnationControl}. */
export interface StagnationControlOptions {
  rho?: number
  tauMin?: number
  tauMax?: number
  alphaBase?: number
  alphaDiffuse?: number
  nowMs?: number
  halfLifeMs?: number
  /** Thermodynamic ρ-schedule (opt-in, PRD GRAPH-CLI Leva A+B Component B) — all
   *  four of rho0/rhoF/lambda/t must be set together, else the static `rho` is used. */
  rho0?: number
  rhoF?: number
  lambda?: number
  t?: number
}

/**
 * Thermodynamic evaporation schedule: `ρ(t) = ρ_f + (ρ_0-ρ_f)·exp(-t/λ)`.
 * High initial evaporation (fast forgetting → exploration) cools exponentially
 * toward a low final rate (trails fix → exploitation). Pure; no clocks/randomness.
 */
export function rhoSchedule(t: number, rho0: number, rhoF: number, lambda: number): number {
  return rhoF + (rho0 - rhoF) * Math.exp(-t / lambda)
}

/**
 * The graph-leaf-cutter Phase-6 controller, run after a task's pheromone deposits.
 * Follows the MMAS iteration order — **evaporate (ρ) → measure entropy → act**:
 *
 * - `stagnant` (H_norm < 0.30): {@link mmasReset} all trails to τ_max to re-diversify.
 * - `diffuse`  (H_norm > 0.85): temporarily raise α to sharpen exploitation.
 * - `healthy`  (otherwise): continue unchanged.
 *
 * Fewer than two trails is insufficient signal — the controller continues rather
 * than declaring a false stagnation. Pure data access; opt-in at the call site.
 */
export function stagnationControl(
  db: Database.Database,
  projectId: string,
  opts: StagnationControlOptions = {},
): StagnationDecision {
  const scheduleConfigured =
    opts.rho0 !== undefined && opts.rhoF !== undefined && opts.lambda !== undefined && opts.t !== undefined
  const rho = scheduleConfigured
    ? rhoSchedule(opts.t as number, opts.rho0 as number, opts.rhoF as number, opts.lambda as number)
    : (opts.rho ?? RHO)
  const tauMin = opts.tauMin ?? TAU_MIN
  const tauMax = opts.tauMax ?? TAU_MAX
  const alphaBase = opts.alphaBase ?? ALPHA_BASE
  const alphaDiffuse = opts.alphaDiffuse ?? ALPHA_DIFFUSE
  const nowMs = opts.nowMs ?? Date.now()
  const halfLifeMs = opts.halfLifeMs ?? PHEROMONE_HALF_LIFE_MS

  globalEvaporation(db, projectId, rho, tauMin) // MMAS order: after deposits
  const strengths = strongestPheromones(db, projectId, Number.MAX_SAFE_INTEGER, nowMs, halfLifeMs).map(
    (p) => p.strength,
  )
  const hNorm = normalizedEntropy(strengths)

  if (strengths.length < 2) {
    return { hNorm, band: 'healthy', action: 'continue', alpha: alphaBase, trailsReset: 0 }
  }

  const band = classifyEntropy(hNorm)
  if (band === 'stagnant') {
    // Elitist memory: capture the champion (argmax τ) BEFORE the wipe and persist
    // it, so re-diversification keeps the field's entropy without erasing which
    // trail was winning (mitigates node_42e2b0c49a94). `strengths` is sorted desc.
    const bestKey = strongestPheromones(db, projectId, 1, nowMs, halfLifeMs)[0]?.key
    const trailsReset = mmasReset(db, projectId, tauMax, nowMs)
    if (bestKey !== undefined) recordBestSoFar(db, projectId, bestKey, strengths[0], nowMs)
    return { hNorm, band, action: 'reset', alpha: alphaBase, trailsReset, bestKey }
  }
  if (band === 'diffuse') {
    return { hNorm, band, action: 'boost_alpha', alpha: alphaDiffuse, trailsReset: 0 }
  }
  return { hNorm, band, action: 'continue', alpha: alphaBase, trailsReset: 0 }
}
