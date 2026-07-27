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
import { DriverSurfaceSchema, type DriverSurface } from '../../schemas/driver-surface.schema.js'
import { leversWithProvenGain } from './lever-evidence-gate.js'
import { readLeverVerdicts } from './lever-verdict-store.js'

/** Minimal read surface (the SqliteStore satisfies it). */
export interface EconomyLeversConfigSource {
  getProjectSetting(key: string): string | null
  /**
   * Levers cuja economia líquida foi PROVADA por A/B — nascem ligados.
   *
   * OPCIONAL de propósito: quem não implementa (todo caller em memória, todo
   * teste antigo) resolve exatamente como antes, então a garantia de
   * "default-OFF byte-idêntico" vale por CONSTRUÇÃO e não por um `if` que
   * alguém pode remover. Quem decide o que entra aqui é `lever-evidence-gate.ts`
   * — leia o aviso lá sobre por que o ledger de savings NÃO serve como fonte.
   */
  getProvenLevers?(): readonly LeverKey[]
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
    /**
     * A fonte real do A/B. Só ESTA fonte implementa a porta — caller em memória
     * segue byte-idêntico, que é a garantia de default-OFF por construção.
     * Import tardio para não acoplar a config ao store no carregamento.
     */
    getProvenLevers(): readonly LeverKey[] {
      return leversWithProvenGain(readLeverVerdicts(db))
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
  'budget_governor',
  'cascade',
  'semantic_cache',
  'submodular_select',
  'memory_salience',
] as const

export type LeverKey = (typeof LEVER_KEYS)[number]

/**
 * Named lever bundles — pure, immutable DATA (never a config write). A bundle is a
 * curated set of levers that a preset (`agf economy preset <name>`) or the
 * auto-activation path (a detected agent driver, task node_7ee81fd6a5e0) can flip on
 * together. Only **loss-safe, deterministic input-side CUTTERS** belong in `build`:
 * they reduce context tokens and every one is guarded by the lossy-gate (auto-revert
 * if a compression breaks meaning). The risky lossy RESHAPERS — `mdl_select` (AST
 * compression) and gateway terse-output — are deliberately excluded and stay opt-in.
 * Reading a bundle mutates nothing: the default-off byte-identical guarantee holds
 * until something explicitly enables a lever.
 */
export const LOSS_SAFE_BUILD_BUNDLE = [
  'ncd_dedup',
  'forage_stop',
  'info_bottleneck',
  'zipf_estimate',
  'heat_kernel',
] as const satisfies readonly LeverKey[]

/** Registry of named bundles. Extend here (OCP) — do not hardcode sets at call sites. */
export const LEVER_BUNDLES: Readonly<Record<string, readonly LeverKey[]>> = {
  build: LOSS_SAFE_BUILD_BUNDLE,
}

/** Look up a named bundle. Unknown name → `undefined` (pure, never throws). */
export function getLeverBundle(name: string): readonly LeverKey[] | undefined {
  return LEVER_BUNDLES[name]
}

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
export interface SemanticCacheParams {
  /** Similaridade mínima do cosseno p/ servir hit semântico. Default: 0.85. */
  threshold?: number
}
export interface CascadeParams {
  /** Máximo de escaladas por chamada. Default: 1 (FrugalGPT). */
  maxEscalations?: number
  /** Threshold do verificador determinístico. Default: 0.6. */
  threshold?: number
}
export interface BudgetKleiberParams {
  /**
   * Orçamento de tokens declarado da sessão/janela. 0 = nada declarado (o
   * governador não deriva alvo). Fonte do targetRatePerMin quando budget_governor
   * o deixa em 0 — ver deriveTargetRatePerMin em budget-kleiber.ts.
   */
  budgetTokens?: number
}
export interface BudgetGovernorParams {
  /** Ganho proporcional do controlador. Default: 0.5. */
  gain?: number
  /** Banda morta relativa (+-). Default: 0.05. */
  hysteresisPct?: number
  /** Janela deslizante do burnRate em ms. Default: 300000 (5 min). */
  windowMs?: number
  /** Alvo em tokens/min. 0 = sem alvo => tick e no-op. Default: 0. */
  targetRatePerMin?: number
}
export interface MemorySalienceParams {
  /** Teto de tokens do pack de memória no retrieval. Default: 200. */
  packBudgetTokens?: number
}
export interface SubmodularSelectParams {
  /** Budget de tokens do context-pack quando o caller não passa um. Default: 2000. */
  budgetTokens?: number
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
  budget_kleiber: BudgetKleiberParams
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
  budget_governor: BudgetGovernorParams
  cascade: CascadeParams
  semantic_cache: SemanticCacheParams
  submodular_select: SubmodularSelectParams
  memory_salience: MemorySalienceParams
}

const LeverStateSchema = z.object({
  enabled: z.boolean().default(false),
  params: z.record(z.string(), z.number()).optional(),
})
export const EconomyLeversConfigSchema = z.record(z.string(), LeverStateSchema).default({})
export type EconomyLeversConfig = z.infer<typeof EconomyLeversConfigSchema>

/** Parse the persisted setting; all-off when unset/invalid. */
function parseStoredConfig(source: EconomyLeversConfigSource): EconomyLeversConfig {
  const raw = source.getProjectSetting(ECONOMY_LEVERS_SETTING_KEY)
  if (!raw) return EconomyLeversConfigSchema.parse({})
  try {
    return EconomyLeversConfigSchema.parse(JSON.parse(raw))
  } catch {
    // Corrupt/partial setting → safe defaults rather than throwing in the hot path.
    return EconomyLeversConfigSchema.parse({})
  }
}

/**
 * Levers a fonte prova terem ganho líquido — nunca deixa a exceção subir.
 *
 * `resolveEconomyLeversConfig` roda em caminho quente (o orquestrador o chama a
 * cada decisão de compressão). Uma leitura de disco que falha ali derrubaria a
 * execução inteira por causa de um smart-default opcional, então o erro vira
 * "sem evidência" — que é exatamente o fail-safe correto.
 */
function provenLeversOf(source: EconomyLeversConfigSource): readonly LeverKey[] {
  if (!source.getProvenLevers) return []
  try {
    return source.getProvenLevers()
  } catch {
    return []
  }
}

/**
 * Resolve the effective config; all-off when unset/invalid.
 *
 * Quando a fonte implementa `getProvenLevers` (só a fonte-DB implementa), os
 * levers com economia líquida PROVADA nascem ligados. O gate apenas ACRESCENTA:
 * nunca desliga o que o operador ligou à mão e nunca sobrescreve os `params` que
 * ele ajustou — o sistema não revoga escolha explícita de quem opera.
 */
export function resolveEconomyLeversConfig(source: EconomyLeversConfigSource): EconomyLeversConfig {
  const stored = parseStoredConfig(source)
  const proven = provenLeversOf(source)
  return proven.length > 0 ? enableBundle(stored, proven) : stored
}

/** True when a lever is explicitly enabled in the resolved config. */
export function isLeverEnabled(cfg: EconomyLeversConfig, key: LeverKey): boolean {
  return cfg[key]?.enabled ?? false
}

/**
 * Return a config with every lever in `bundle` flagged enabled, merged over `cfg`
 * (params preserved). PURE — it takes and returns a value and never writes the
 * persisted setting, so the default-off byte-identical guarantee is only ever
 * broken by an explicit caller (a preset command, or the agent-driver
 * auto-activation in task-prep). Non-bundle levers are left exactly as they were.
 */
export function enableBundle(cfg: EconomyLeversConfig, bundle: readonly LeverKey[]): EconomyLeversConfig {
  const next: EconomyLeversConfig = { ...cfg }
  for (const key of bundle) {
    next[key] = { enabled: true, params: cfg[key]?.params }
  }
  return next
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
 * Registry lever → superfícies do DRIVER onde ela dispara (contract node_eb434a0955c2;
 * F2.T1 node_063ea8c358af). Fonte ÚNICA da atribuição — o gap-check
 * `driver_boundary_missing` e o `savings --by-surface` leem exatamente estes valores.
 * `internal`-only é permitido mas explícito: essas levers nunca contam como
 * efeito-no-driver. Wired≠firing≠firing-no-driver — este mapa torna o terceiro
 * estado declarável e cobrável.
 */
export const LEVER_DRIVER_SURFACES: Record<LeverKey, readonly DriverSurface[]> = {
  heat_kernel: ['context'],
  budget_kleiber: ['internal'],
  mdl_select: ['hook'],
  info_bottleneck: ['context'],
  forage_stop: ['context'],
  ncd_dedup: ['context'],
  stigmergy: ['internal'],
  consolidation: ['internal'],
  zipf_estimate: ['context'],
  context_diff: ['context'],
  quorum_gate: ['internal'],
  learned_routing: ['internal'],
  aco_autotune: ['internal'],
  cognitive_debt: ['internal'],
  budget_governor: ['internal'],
  cascade: ['internal'],
  semantic_cache: ['internal'],
  submodular_select: ['context'],
  memory_salience: ['context'],
}

const LeverDriverSurfacesSchema = z.object(
  Object.fromEntries(LEVER_KEYS.map((k) => [k, z.array(DriverSurfaceSchema).min(1)])) as Record<
    LeverKey,
    z.ZodArray<typeof DriverSurfaceSchema>
  >,
)

/**
 * Valida um registry de superfícies: toda lever de LEVER_KEYS presente com ≥1
 * superfície do enum. Lança ZodError cujo path nomeia a lever ofensora — usado
 * como teste-guarda do registry e por consumidores que recebem mapas dinâmicos.
 */
export function validateLeverDriverSurfaces(
  registry: Record<LeverKey, readonly DriverSurface[]>,
): Record<LeverKey, DriverSurface[]> {
  return LeverDriverSurfacesSchema.parse(registry) as Record<LeverKey, DriverSurface[]>
}

/**
 * Default threshold values for each lever — the single source of truth.
 * When a default changes in source, `agf economy list` reflects it automatically.
 */
export const LEVER_DEFAULTS: Record<LeverKey, Record<string, number>> = {
  heat_kernel: { t: 0.5, seedWeight: 0.5 },
  budget_kleiber: { budgetTokens: 0 },
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
  budget_governor: { gain: 0.5, hysteresisPct: 0.05, windowMs: 300000, targetRatePerMin: 0 },
  cascade: { maxEscalations: 1, threshold: 0.6 },
  semantic_cache: { threshold: 0.85 },
  submodular_select: { budgetTokens: 2000 },
  memory_salience: { packBudgetTokens: 200 },
}

export interface LeverListEntry {
  name: LeverKey
  enabled: boolean
  saved: number
  params: Record<string, number>
  /** Default numeric thresholds for this lever — sourced from LEVER_DEFAULTS (not a static copy). */
  thresholds: Record<string, number>
  /** Superfícies do driver onde a lever dispara — sourced from LEVER_DRIVER_SURFACES. */
  driverSurfaces: readonly DriverSurface[]
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
    driverSurfaces: LEVER_DRIVER_SURFACES[name],
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
