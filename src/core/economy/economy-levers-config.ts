/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Economy-levers config — opt-in flags for the bio/math token-economy levers.
 *
 * Mirrors {@link ../context/flow-config.ts}: a single `economy_levers_config`
 * project setting (JSON) gates each lever. Absent/corrupt ⇒ every lever OFF, so
 * the pipelines behave byte-identically to before. The only writer is the
 * `agf economy` command; seams read with {@link isLeverEnabled}.
 */

import { z } from 'zod/v4'
import type Database from 'better-sqlite3'
import { TAU_MIN, TAU_MAX, ALPHA, RHO } from './aco-params.js'

/** Minimal read surface (the SqliteStore satisfies it). */
export interface EconomyLeversConfigSource {
  getProjectSetting(key: string): string | null
}

/**
 * Levers source over a raw better-sqlite3 handle (no SqliteStore). The economy
 * gateway middleware holds a bare `Database`; this reads the single project's
 * setting so gateway levers can still honour the `agf economy` toggle. Returns
 * null (⇒ all-off) on any error or missing table.
 */
export function economyLeversSourceFromDb(db: Database.Database): EconomyLeversConfigSource {
  return {
    getProjectSetting(key: string): string | null {
      try {
        const row = db.prepare('SELECT value FROM project_settings WHERE key = ? LIMIT 1').get(key) as
          { value: string } | undefined
        return row?.value ?? null
      } catch {
        return null
      }
    },
  }
}

/** Read+write surface for toggling (the SqliteStore satisfies it). */
export interface EconomyLeversConfigStore extends EconomyLeversConfigSource {
  setProjectSetting(key: string, value: string): void
}

export const ECONOMY_LEVERS_SETTING_KEY = 'economy_levers_config'

/** Canonical lever keys wired into the agf pipelines (also the ledger `lever` names). */
export const LEVER_KEYS = [
  'heat_kernel',
  'budget_kleiber',
  'mdl_select',
  'info_bottleneck',
  'forage_stop',
  'ncd_dedup',
  'stigmergy',
  'consolidation',
  'zipf_estimate',
  'context_diff',
  'quorum_gate',
  'learned_routing',
  'aco_autotune',
  'cognitive_debt',
] as const

export type LeverKey = (typeof LEVER_KEYS)[number]

/**
 * Typed parameter interfaces per lever. Each key maps to a record of
 * numeric knobs that override the hardcoded defaults at runtime.
 */
export interface HeatKernelParams {
  /** Diffusion time t for e^{-tL}. Higher = wider spread. Default: code-level default. */
  t?: number
  /** Relevance influence on gain (0 = no boost, 1 = up to 2×). Default: 0.5. */
  seedWeight?: number
}
export interface MdlSelectParams {
  /** Minimum saved bytes to justify a round-trip. Default: 24. */
  retrievalPenaltyBytes?: number
  /** Fraction of elements matching the ref key set for homogeneity. Default: 0.9. */
  homogeneityThreshold?: number
  /** Min bytes for JSON array compression. Default: 256. */
  jsonMinCompress?: number
  /** Min bytes for AST compression. Default: 512. */
  codeAstMin?: number
}
export interface InfoBottleneckParams {
  /** IB beta — fidelity weight vs token savings. Default: 2. */
  beta?: number
}
export interface ForageStopParams {
  /** Minimum items to always keep in context. Default: 1. */
  minItems?: number
  /** Epsilon-greedy exploration probability. Default: 0 (pure exploit). */
  epsilon?: number
}
export interface NcdDedupParams {
  /** NCD similarity threshold below which items are near-duplicates. Default: 0.3. */
  threshold?: number
}
export interface StigmergyParams {
  /** Pheromone half-life in ms. Default: 7 days. */
  halfLifeMs?: number
  /** Minimum trail strength to consider. Default: 1e-3. */
  epsilon?: number
  /** How many strongest trails to return. Default: 5. */
  trailLimit?: number
}
export interface ConsolidationParams {
  /** Multiplicative downscale factor for memory traces. Default: 0.5. */
  downscale?: number
  /** Salience floor. Default: 0. */
  floor?: number
  /** NCD threshold for merging similar traces. Default: 0.3. */
  mergeThreshold?: number
}
export interface AcoAutotuneParams {
  /** Pheromone influence exponent α evolved by GA. */
  alpha?: number
  /** Global evaporation rate ρ evolved by GA (static fallback when no schedule is set). */
  rho?: number
  /** Min pheromone bound τ_min evolved by GA. */
  tauMin?: number
  /** Max pheromone bound τ_max evolved by GA. */
  tauMax?: number
  /** Thermodynamic ρ-schedule: initial (high) evaporation rate. Default: 0.30. */
  rho0?: number
  /** Thermodynamic ρ-schedule: final (low) evaporation rate. Default: 0.02. */
  rhoF?: number
  /** Thermodynamic ρ-schedule: cooling time constant λ. Default: 100. */
  lambda?: number
  /** Lévy exploration: probability of a long jump instead of the roulette pick. Default: 0.10. */
  pLevy?: number
  /** Lévy exploration: tail-heaviness index β_L (1,2]. Default: 1.5. */
  betaLevy?: number
  /** Lévy exploration: jump-scale multiplier κ. Default: 1.0. */
  kappa?: number
}

/** Mapping: lever key → its typed params interface. */
export interface LeverParams {
  heat_kernel: HeatKernelParams
  budget_kleiber: Record<string, never>
  mdl_select: MdlSelectParams
  info_bottleneck: InfoBottleneckParams
  forage_stop: ForageStopParams
  ncd_dedup: NcdDedupParams
  stigmergy: StigmergyParams
  consolidation: ConsolidationParams
  zipf_estimate: Record<string, never>
  context_diff: Record<string, never>
  quorum_gate: Record<string, never>
  learned_routing: Record<string, never>
  aco_autotune: AcoAutotuneParams
  cognitive_debt: Record<string, never>
}

const LeverStateSchema = z.object({
  enabled: z.boolean().default(false),
  params: z.record(z.string(), z.number()).optional(),
})
export const EconomyLeversConfigSchema = z.record(z.string(), LeverStateSchema).default({})
export type EconomyLeversConfig = z.infer<typeof EconomyLeversConfigSchema>

/** Resolve the effective config; all-off when unset/invalid. */
export function resolveEconomyLeversConfig(source: EconomyLeversConfigSource): EconomyLeversConfig {
  const raw = source.getProjectSetting(ECONOMY_LEVERS_SETTING_KEY)
  if (!raw) return EconomyLeversConfigSchema.parse({})
  try {
    return EconomyLeversConfigSchema.parse(JSON.parse(raw))
  } catch {
    // Corrupt/partial setting → safe defaults rather than throwing in the hot path.
    return EconomyLeversConfigSchema.parse({})
  }
}

/** True when a lever is explicitly enabled in the resolved config. */
export function isLeverEnabled(cfg: EconomyLeversConfig, key: LeverKey): boolean {
  return cfg[key]?.enabled ?? false
}

/**
 * Read a numeric parameter from a lever's config, falling back to `defaultVal`
 * when absent. Type-safe: only accepts param names known for that lever.
 *
 * ```ts
 * const eps = getLeverParam(cfg, 'forage_stop', 'epsilon', 0.1)
 * ```
 */
export function getLeverParam<K extends keyof LeverParams>(
  cfg: EconomyLeversConfig,
  key: K,
  param: keyof LeverParams[K] & string,
  defaultVal: number,
): number
/** Runtime overload: accepts any LeverKey + string param. */
export function getLeverParam(cfg: EconomyLeversConfig, key: LeverKey, param: string, defaultVal: number): number
export function getLeverParam(cfg: EconomyLeversConfig, key: LeverKey, param: string, defaultVal: number): number {
  const stored = cfg[key]?.params?.[param]
  if (stored !== undefined && typeof stored === 'number' && Number.isFinite(stored)) return stored
  return defaultVal
}

/** Read all stored params for a lever (flat record, may be empty). */
export function getLeverParams(cfg: EconomyLeversConfig, key: LeverKey): Readonly<Record<string, number>> {
  return cfg[key]?.params ?? {}
}

/**
 * Default threshold values for each lever — the single source of truth.
 * When a default changes in source, `agf economy list` reflects it automatically.
 */
export const LEVER_DEFAULTS: Record<LeverKey, Record<string, number>> = {
  heat_kernel: { t: 0.5, seedWeight: 0.5 },
  budget_kleiber: {},
  mdl_select: { retrievalPenaltyBytes: 24, homogeneityThreshold: 0.9, jsonMinCompress: 256, codeAstMin: 512 },
  info_bottleneck: { beta: 2 },
  forage_stop: { minItems: 1, epsilon: 0 },
  ncd_dedup: { threshold: 0.3 },
  stigmergy: { halfLifeMs: 604800000, epsilon: 0.001, trailLimit: 5 },
  consolidation: { downscale: 0.5, floor: 0, mergeThreshold: 0.3 },
  zipf_estimate: {},
  context_diff: {},
  quorum_gate: {},
  learned_routing: {},
  aco_autotune: {
    alpha: ALPHA,
    rho: RHO,
    tauMin: TAU_MIN,
    tauMax: TAU_MAX,
    rho0: 0.3,
    rhoF: 0.02,
    lambda: 100,
    pLevy: 0.1,
    betaLevy: 1.5,
    kappa: 1.0,
  },
  cognitive_debt: {},
}

export interface LeverListEntry {
  name: LeverKey
  enabled: boolean
  saved: number
  params: Record<string, number>
  /** Default numeric thresholds for this lever — sourced from LEVER_DEFAULTS (not a static copy). */
  thresholds: Record<string, number>
}

/**
 * Build a single lever entry for the `economy list` output.
 * Thresholds are merged: stored params override defaults, but defaults always appear.
 */
export function buildLeverListEntry(
  name: LeverKey,
  enabled: boolean,
  saved: number,
  params: Record<string, number>,
): LeverListEntry {
  return {
    name,
    enabled,
    saved,
    params,
    thresholds: { ...LEVER_DEFAULTS[name] },
  }
}

/** Persist one lever's enabled flag (merge, never clobber the others or params). Returns the new config. */
export function setLeverEnabled(store: EconomyLeversConfigStore, key: LeverKey, enabled: boolean): EconomyLeversConfig {
  const current = resolveEconomyLeversConfig(store)
  const prev = current[key]
  const next: EconomyLeversConfig = { ...current, [key]: { enabled, params: prev?.params } }
  store.setProjectSetting(ECONOMY_LEVERS_SETTING_KEY, JSON.stringify(next))
  return next
}

/** Set a numeric parameter on a lever (merge, preserves enabled flag and other params). Returns the new config. */
export function setLeverParam<K extends keyof LeverParams>(
  store: EconomyLeversConfigStore,
  key: K,
  param: keyof LeverParams[K] & string,
  value: number,
): EconomyLeversConfig
/** Runtime overload: accepts any LeverKey + string param (for CLI etc.). */
export function setLeverParam(
  store: EconomyLeversConfigStore,
  key: LeverKey,
  param: string,
  value: number,
): EconomyLeversConfig
export function setLeverParam(
  store: EconomyLeversConfigStore,
  key: LeverKey,
  param: string,
  value: number,
): EconomyLeversConfig {
  const current = resolveEconomyLeversConfig(store)
  const prev = current[key]
  const next: EconomyLeversConfig = {
    ...current,
    [key]: {
      enabled: prev?.enabled ?? false,
      params: { ...prev?.params, [param]: value },
    },
  }
  store.setProjectSetting(ECONOMY_LEVERS_SETTING_KEY, JSON.stringify(next))
  return next
}
