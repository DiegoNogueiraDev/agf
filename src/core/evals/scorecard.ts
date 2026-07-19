/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Scorecard do eval — agrega os resultados de cenário (por tier e por modelo) nas
 * métricas dos 3 pilares: **resolve%** (best-practice/correção), **custo-por-sucesso**
 * (token, a métrica honesta da Microsoft), **tokens/task** e **p50/p95 latência**
 * (rápido). Puro: alimenta a decisão de estado-da-arte. `formatScorecard` rende.
 *
 * Também é a FONTE ÚNICA (DRY, node_d35e86e659dc) das 8 dims de velocity —
 * lead-time, cycle-time/task, flow-efficiency, FPY, rework-rate,
 * gate-pass-rate, $/task, tokens/task — computadas de grafo+ledger e
 * consumidas por `agf eval`, `agf metrics` E `agf insights` (a MESMA
 * computação, nunca três paralelas). `computeVelocityScorecard` é puro;
 * `collectVelocityScorecard` colhe os inputs do store reusando
 * dora-metrics, metrics-calculator, first-pass-yield e llm-call-ledger.
 */

import type Database from 'better-sqlite3'

import type { SqliteStore } from '../store/sqlite-store.js'
import { calculateDoraMetrics } from '../insights/dora-metrics.js'
import { calculateMetrics } from '../insights/metrics-calculator.js'
import { computeFirstPassYield } from '../economy/first-pass-yield.js'
import { summarizeLedger } from '../observability/llm-call-ledger.js'
import { collectTierTrade, type TierTrade } from './tier-trade.js'

export interface ScenarioResult {
  id: string
  tier: string
  model: string
  persona?: string
  /** Resolvido = test-suite verde E task chegou a `done` (DoD). */
  resolved: boolean
  testsPassed: boolean
  done: boolean
  tokensIn: number
  tokensOut: number
  tokensTotal: number
  /** Tokens served from Anthropic prompt cache (cache_read_input_tokens). */
  cachedTokensIn: number
  costUsd: number
  attempts: number
  durationMs: number
  stopped: string
  /** Quality score 0-1: (correctness + ac_coverage) / 2. */
  qualityScore: number
  /** Mensagem do erro que abortou a orquestração (ex.: 401 do provider). Ausente em sucesso. */
  error?: string
  /** Classe do erro (classifyLlmError): 'auth' | 'rate_limit' | 'server' | … — surface actionable. */
  errorKind?: string
}

export interface TierAgg {
  tier: string
  total: number
  resolved: number
  resolveRate: number
  totalCostUsd: number
  costPerResolvedUsd: number | null
  avgTokens: number
  /** Avg tokens for resolved scenarios. null if none resolved. */
  avgTokensResolved: number | null
  /** Avg tokens for failed scenarios. null if none failed. */
  avgTokensFailed: number | null
  /** Total tokens consumed by unresolved scenarios. */
  tokensWastedOnFailures: number
  p50Ms: number
  p95Ms: number
  ci95Lower: number | null
  ci95Upper: number | null
}

export interface ModelAgg {
  model: string
  total: number
  resolved: number
  resolveRate: number
  totalCostUsd: number
  costPerResolvedUsd: number | null
  /** Alias for costPerResolvedUsd (null = Infinity / NA when 0 successes). */
  costPerSuccess: number | null
  avgTokens: number
  avgTokensIn: number
  avgTokensOut: number
  avgQualityScore: number
  avgLatencyMs: number
  ci95Lower: number | null
  ci95Upper: number | null
}

export interface ModelComparison {
  modelA: string
  modelB: string
  cohensH: number
  interpretation: string
}

export interface Scorecard {
  total: number
  resolved: number
  resolveRate: number
  totalCostUsd: number
  costPerResolvedUsd: number | null
  totalTokens: number
  /** Sum of cache_read_input_tokens across all scenario runs. */
  totalCachedTokensIn: number
  /** totalCachedTokensIn / sum(tokensIn). 0 when no input tokens. */
  cacheHitRate: number
  /** Estimated USD saved by prompt cache (full price − cache price per token). */
  estimatedCacheSavingsUsd: number
  byTier: TierAgg[]
  byModel: ModelAgg[]
  comparisons: ModelComparison[]
  results: ScenarioResult[]
}

/** Percentil por nearest-rank (sem dependência). */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length))
  return sorted[idx]
}

function costPerResolved(totalCostUsd: number, resolved: number): number | null {
  return resolved > 0 ? totalCostUsd / resolved : null
}

function ci95Wilson(n: number, successes: number): { lower: number; upper: number } | null {
  if (n < 3) return null
  const z = 1.96
  const p = successes / n
  if (p <= 0 || p >= 1) return { lower: p, upper: p }
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = p + z2 / (2 * n)
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)
  return {
    lower: Math.max(0, (center - margin) / denom),
    upper: Math.min(1, (center + margin) / denom),
  }
}

function arcsine(p: number): number {
  return 2 * Math.asin(Math.sqrt(p))
}

function cohensH(p1: number, p2: number): number {
  return arcsine(p1) - arcsine(p2)
}

function cohensHInterpretation(h: number): string {
  const abs = Math.abs(h)
  if (abs < 0.2) return 'desprezível'
  if (abs < 0.5) return 'pequeno'
  if (abs < 0.8) return 'médio'
  return 'grande'
}

function _computeAggWithCI(
  total: number,
  resolved: number,
  totalCostUsd: number,
  avgTokens: number,
  ci95Lower: number | null,
  ci95Upper: number | null,
  durations?: number[],
): {
  resolveRate: number
  costPerResolvedUsd: number | null
  p50Ms: number
  p95Ms: number
  ci95Lower: number | null
  ci95Upper: number | null
} {
  const resolveRate = total > 0 ? resolved / total : 0
  if (!ci95Lower && !ci95Upper) {
    const ci = ci95Wilson(total, resolved)
    if (ci) {
      ci95Lower = ci.lower
      ci95Upper = ci.upper
    }
  }
  const p50Ms = durations
    ? percentile(
        [...durations].sort((a, b) => a - b),
        0.5,
      )
    : 0
  const p95Ms = durations
    ? percentile(
        [...durations].sort((a, b) => a - b),
        0.95,
      )
    : 0
  return {
    resolveRate,
    costPerResolvedUsd: costPerResolved(totalCostUsd, resolved),
    p50Ms,
    p95Ms,
    ci95Lower,
    ci95Upper,
  }
}

// Anthropic prompt cache: read tokens cost ~10% of regular input tokens.
const CACHE_SAVINGS_RATE = 0.9

export function buildScorecard(results: ScenarioResult[]): Scorecard {
  const total = results.length
  const resolved = results.filter((r) => r.resolved).length
  const totalCostUsd = results.reduce((s, r) => s + r.costUsd, 0)
  const totalTokens = results.reduce((s, r) => s + r.tokensTotal, 0)
  const totalCachedTokensIn = results.reduce((s, r) => s + (r.cachedTokensIn ?? 0), 0)
  const totalTokensIn = results.reduce((s, r) => s + r.tokensIn, 0)
  const cacheHitRate = totalTokensIn > 0 ? totalCachedTokensIn / totalTokensIn : 0
  // Default input price $1/M; savings = cached * regularPrice * CACHE_SAVINGS_RATE
  const INPUT_PRICE_PER_TOKEN = 1.0 / 1_000_000
  const estimatedCacheSavingsUsd = totalCachedTokensIn * INPUT_PRICE_PER_TOKEN * CACHE_SAVINGS_RATE

  const groupBy = <K extends string>(key: (r: ScenarioResult) => K): Map<K, ScenarioResult[]> => {
    const m = new Map<K, ScenarioResult[]>()
    for (const r of results) {
      const k = key(r)
      const arr = m.get(k) ?? []
      arr.push(r)
      m.set(k, arr)
    }
    return m
  }

  const byTier: TierAgg[] = [...groupBy((r) => r.tier).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([tier, rs]) => {
      const res = rs.filter((r) => r.resolved).length
      const cost = rs.reduce((s, r) => s + r.costUsd, 0)
      const durations = rs.map((r) => r.durationMs)
      const ci = rs.length >= 3 ? ci95Wilson(rs.length, res) : null
      const resolvedRs = rs.filter((r) => r.resolved)
      const failedRs = rs.filter((r) => !r.resolved)
      const avgTokensResolved =
        resolvedRs.length > 0 ? resolvedRs.reduce((s, r) => s + r.tokensTotal, 0) / resolvedRs.length : null
      const avgTokensFailed =
        failedRs.length > 0 ? failedRs.reduce((s, r) => s + r.tokensTotal, 0) / failedRs.length : null
      const tokensWastedOnFailures = failedRs.reduce((s, r) => s + r.tokensTotal, 0)
      return {
        tier,
        total: rs.length,
        resolved: res,
        resolveRate: rs.length > 0 ? res / rs.length : 0,
        totalCostUsd: cost,
        costPerResolvedUsd: costPerResolved(cost, res),
        avgTokens: rs.length > 0 ? Math.round(rs.reduce((s, r) => s + r.tokensTotal, 0) / rs.length) : 0,
        avgTokensResolved,
        avgTokensFailed,
        tokensWastedOnFailures,
        p50Ms: percentile(
          [...durations].sort((a, b) => a - b),
          0.5,
        ),
        p95Ms: percentile(
          [...durations].sort((a, b) => a - b),
          0.95,
        ),
        ci95Lower: ci?.lower ?? null,
        ci95Upper: ci?.upper ?? null,
      }
    })

  const byModel: ModelAgg[] = [...groupBy((r) => r.model).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([model, rs]) => {
      const res = rs.filter((r) => r.resolved).length
      const cost = rs.reduce((s, r) => s + r.costUsd, 0)
      const ci = rs.length >= 3 ? ci95Wilson(rs.length, res) : null
      const n = rs.length
      return {
        model,
        total: n,
        resolved: res,
        resolveRate: n > 0 ? res / n : 0,
        totalCostUsd: cost,
        costPerResolvedUsd: costPerResolved(cost, res),
        costPerSuccess: costPerResolved(cost, res),
        avgTokens: n > 0 ? Math.round(rs.reduce((s, r) => s + r.tokensTotal, 0) / n) : 0,
        avgTokensIn: n > 0 ? Math.round(rs.reduce((s, r) => s + r.tokensIn, 0) / n) : 0,
        avgTokensOut: n > 0 ? Math.round(rs.reduce((s, r) => s + r.tokensOut, 0) / n) : 0,
        avgQualityScore: n > 0 ? rs.reduce((s, r) => s + (r.qualityScore ?? 0), 0) / n : 0,
        avgLatencyMs: n > 0 ? Math.round(rs.reduce((s, r) => s + r.durationMs, 0) / n) : 0,
        ci95Lower: ci?.lower ?? null,
        ci95Upper: ci?.upper ?? null,
      }
    })

  const comparisons: ModelComparison[] = []
  if (byModel.length >= 2) {
    for (let i = 0; i < byModel.length; i++) {
      for (let j = i + 1; j < byModel.length; j++) {
        const m1 = byModel[i]
        const m2 = byModel[j]
        if (m1.total < 3 || m2.total < 3) continue
        const h = cohensH(m1.resolveRate, m2.resolveRate)
        comparisons.push({
          modelA: m1.model,
          modelB: m2.model,
          cohensH: Math.round(h * 1000) / 1000,
          interpretation: cohensHInterpretation(h),
        })
      }
    }
  }

  return {
    total,
    resolved,
    resolveRate: total > 0 ? resolved / total : 0,
    totalCostUsd,
    costPerResolvedUsd: costPerResolved(totalCostUsd, resolved),
    totalTokens,
    totalCachedTokensIn,
    cacheHitRate,
    estimatedCacheSavingsUsd,
    byTier,
    byModel,
    comparisons,
    results,
  }
}

// ── Velocity dims (node_d35e86e659dc) — fonte única das 8 métricas ──────────

/**
 * As 8 métricas de velocity, SEMPRE numéricas (contrato: nunca null — sem
 * dado ⇒ 0 + `note`), para que qualquer consumidor (`eval`/`metrics`/
 * `insights`) possa exibi-las sem null-guard.
 */
export interface VelocityScorecard {
  /** p50 created→done, horas (DORA lead time). */
  leadTimeHours: number
  /** Média in-flight→done por task, horas. */
  cycleTimeHours: number
  /** % 0-100: in_progress / (in_progress + ready + blocked) — proxy snapshot. */
  flowEfficiency: number
  /** First-Pass Yield 0-1: primeiro outcome success / entregues. */
  fpy: number
  /** 0-1: fração de tasks com reversão de status (DORA change failure rate). */
  reworkRate: number
  /** 0-1: outcomes success / total de outcomes (todas as tentativas). */
  gatePassRate: number
  /** Custo USD do ledger / tasks done. */
  costPerTaskUsd: number
  /** Tokens totais do ledger / tasks done. */
  tokensPerTask: number
  /** Tasks done que ancoram os per-task. */
  doneTasks: number
  /** Breakdown por agente (claimedBy dos nodes done + sessões do ledger). */
  byAgent: AgentVelocity[]
  /** Troca economia↔latência por tier (frontier-first); null quando o ledger falha. */
  tierTrade?: TierTrade | null
  /** Presente quando não há entregas — explica os zeros. */
  note?: string
}

/** Velocidade agregada por formiga/agente (OKR de equipe). */
export interface AgentVelocity {
  agent: string
  doneTasks: number
  leadTimeHours: number
  tokensPerTask: number
}

/** Inputs crus da computação — puros, montados por `collectVelocityScorecard`. */
export interface VelocityInputs {
  doneTasks: number
  leadTimeP50Hours: number
  avgCompletionHours: number
  /** Tasks in_progress (snapshot). */
  active: number
  /** Tasks ready + blocked (snapshot). */
  waiting: number
  /** FPY 0-1 ou null quando delivered=0. */
  fpyValue: number | null
  changeFailureRate: number
  gateOutcomes: { passed: number; total: number }
  ledgerTotals: { costUsd: number; tokens: number }
  /** Per-agent aggregates. Empty array when no identity data exists. */
  byAgent: AgentVelocity[]
  /** Troca economia↔latência por tier; null quando o ledger está indisponível. */
  tierTrade?: TierTrade | null
}

const round2 = (n: number): number => Math.round(n * 100) / 100
// Custo por task é sub-cent em modelos baratos — 2 casas achataria a $0.
const round6 = (n: number): number => Math.round(n * 1_000_000) / 1_000_000

/** Computa as 8 dims de velocity. Puro; zero entregas ⇒ tudo 0 + note. */
export function computeVelocityScorecard(i: VelocityInputs): VelocityScorecard {
  const denom = i.active + i.waiting
  const sc: VelocityScorecard = {
    leadTimeHours: round2(i.leadTimeP50Hours),
    cycleTimeHours: round2(i.avgCompletionHours),
    flowEfficiency: denom > 0 ? Math.round((i.active / denom) * 100) : 0,
    fpy: i.fpyValue ?? 0,
    reworkRate: round2(i.changeFailureRate),
    gatePassRate: i.gateOutcomes.total > 0 ? round2(i.gateOutcomes.passed / i.gateOutcomes.total) : 0,
    costPerTaskUsd: i.doneTasks > 0 ? round6(i.ledgerTotals.costUsd / i.doneTasks) : 0,
    tokensPerTask: i.doneTasks > 0 ? Math.round(i.ledgerTotals.tokens / i.doneTasks) : 0,
    doneTasks: i.doneTasks,
    byAgent: i.byAgent,
    tierTrade: i.tierTrade ?? undefined,
  }
  if (i.doneTasks === 0) {
    sc.note = 'sem tasks done — métricas de velocity zeradas até a primeira entrega'
  }
  return sc
}

/**
 * Colhe os inputs de grafo+ledger e computa o scorecard de velocity.
 * Reusa (nunca reimplementa): calculateDoraMetrics (lead-time, rework),
 * calculateMetrics (cycle-time), computeFirstPassYield (FPY) e
 * summarizeLedger ($/task, tokens/task). Gate-pass-rate lê os episodic
 * outcomes (mesma fonte do FPY): success / total, todas as tentativas.
 */
export function collectVelocityScorecard(store: SqliteStore): VelocityScorecard {
  const db = store.getDb()
  const dora = calculateDoraMetrics(store)
  const metrics = calculateMetrics(store.toGraphDocument())
  const fpy = computeFirstPassYield(db, { maxAgeDays: 30 })
  const ledger = summarizeLedger(db)
  const byStatus = store.getStats().byStatus as Record<string, number>

  let gateOutcomes = { passed: 0, total: 0 }
  try {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END), 0) AS passed
         FROM episodic_outcomes`,
      )
      .get() as { total: number; passed: number }
    gateOutcomes = { passed: row.passed, total: row.total }
  } catch {
    // tabela ausente (store legado pré-migração) — segue com 0/0.
  }

  const byAgent = computeByAgent(store, db, ledger.totals.total)

  return computeVelocityScorecard({
    doneTasks: metrics.velocity.tasksCompleted,
    leadTimeP50Hours: dora.leadTime.p50,
    avgCompletionHours: metrics.velocity.avgCompletionHours,
    active: byStatus.in_progress ?? 0,
    waiting: (byStatus.ready ?? 0) + (byStatus.blocked ?? 0),
    fpyValue: fpy.value,
    changeFailureRate: dora.changeFailureRate,
    gateOutcomes,
    ledgerTotals: { costUsd: ledger.totals.costUsd, tokens: ledger.totals.total },
    byAgent,
    tierTrade: collectTierTrade(store),
  })
}

/**
 * Colhe os agregados por agente (claimedBy) a partir dos nodes done + ledger.
 * Tolerante: DB sem `llm_call_ledger` ⇒ tokensPerTask = 0.
 */
function computeByAgent(store: SqliteStore, db: Database.Database, _totalTokens: number): AgentVelocity[] {
  const nodes = store.toGraphDocument().nodes.filter((n) => n.status === 'done')
  if (nodes.length === 0) return []

  const agentOfGraphNode = (n: { metadata?: Record<string, unknown> }): string =>
    (n.metadata?.claimedBy as string | undefined) ?? '(unattributed)'

  const agentMap = new Map<string, { doneTasks: number; leadTimes: number[] }>()
  for (const n of nodes) {
    const agent = agentOfGraphNode(n)
    const entry = agentMap.get(agent) ?? { doneTasks: 0, leadTimes: [] }
    entry.doneTasks++
    const leadHours =
      n.createdAt && n.updatedAt ? (new Date(n.updatedAt).getTime() - new Date(n.createdAt).getTime()) / 3_600_000 : 0
    entry.leadTimes.push(leadHours)
    agentMap.set(agent, entry)
  }

  let nodeTokens: Map<string, number> | undefined
  try {
    const rows = db
      .prepare(
        `SELECT node_id, COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
         FROM llm_call_ledger WHERE node_id IS NOT NULL
         GROUP BY node_id`,
      )
      .all() as Array<{ node_id: string; tokens: number }>
    nodeTokens = new Map(rows.map((r) => [r.node_id, r.tokens]))
  } catch {
    // tabela ausente no mock — tokensPerTask será 0
  }

  const byAgent: AgentVelocity[] = []
  for (const [agent, data] of agentMap) {
    const agentTokens = nodeTokens
      ? nodes.filter((n) => agentOfGraphNode(n) === agent).reduce((sum, n) => sum + (nodeTokens.get(n.id) ?? 0), 0)
      : 0
    const doneTasks = data.doneTasks
    const totalLead = data.leadTimes.reduce((s, v) => s + v, 0)
    byAgent.push({
      agent,
      doneTasks,
      leadTimeHours: doneTasks > 0 ? Math.round((totalLead / doneTasks) * 100) / 100 : 0,
      tokensPerTask: doneTasks > 0 ? Math.round(agentTokens / doneTasks) : 0,
    })
  }

  byAgent.sort((a, b) => b.doneTasks - a.doneTasks)
  return byAgent
}

function formatPctWithCI(resolveRate: number, ci95Lower: number | null, ci95Upper: number | null): string {
  const pct = (n: number): string => `${Math.round(n * 100)}%`
  if (ci95Lower != null && ci95Upper != null && ci95Lower !== ci95Upper) {
    return `${pct(resolveRate)} (CI95% ${pct(ci95Lower)}–${pct(ci95Upper)})`
  }
  return pct(resolveRate)
}

export function formatScorecard(sc: Scorecard): string[] {
  const pct = (n: number): string => `${Math.round(n * 100)}%`
  const usd = (n: number | null): string => (n == null ? '—' : `$${n.toFixed(4)}`)
  const lines: string[] = []
  lines.push(
    `Scorecard — ${sc.resolved}/${sc.total} resolvidos (${pct(sc.resolveRate)}) · custo-por-sucesso ${usd(sc.costPerResolvedUsd)} · ${sc.totalTokens} tok`,
  )
  if (sc.totalCachedTokensIn > 0) {
    lines.push(
      `Cache prompt — ${sc.totalCachedTokensIn} tok cached · hit ${pct(sc.cacheHitRate)} · savings estimados $${sc.estimatedCacheSavingsUsd.toFixed(4)}`,
    )
  }
  lines.push('')
  lines.push('Por tier (resolve% × IC95% × custo/sucesso × tokens × p50/p95):')
  lines.push(
    `  ${'tier'.padEnd(6)} ${'resolve'.padEnd(32)} ${'custo/sucesso'.padEnd(14)} ${'tok/task'.padEnd(9)} p50/p95`,
  )
  for (const t of sc.byTier) {
    lines.push(
      `  ${t.tier.padEnd(6)} ${`${t.resolved}/${t.total} ${formatPctWithCI(t.resolveRate, t.ci95Lower, t.ci95Upper)}`.padEnd(32)} ${usd(t.costPerResolvedUsd).padEnd(14)} ${String(t.avgTokens).padEnd(9)} ${Math.round(t.p50Ms)}/${Math.round(t.p95Ms)}ms`,
    )
  }
  if (sc.byModel.length > 0) {
    lines.push('', 'Por modelo:')
    for (const m of sc.byModel) {
      lines.push(
        `  ${m.model.padEnd(28)} ${m.resolved}/${m.total} ${formatPctWithCI(m.resolveRate, m.ci95Lower, m.ci95Upper)} · custo/sucesso ${usd(m.costPerResolvedUsd)}`,
      )
    }
  }
  if (sc.comparisons.length > 0) {
    lines.push('', "Efeito entre modelos (Cohen's h):")
    lines.push(`  ${'modelo A'.padEnd(28)} ${'modelo B'.padEnd(28)} ${'h'.padEnd(8)} interpretação`)
    for (const c of sc.comparisons) {
      lines.push(`  ${c.modelA.padEnd(28)} ${c.modelB.padEnd(28)} ${String(c.cohensH).padEnd(8)} ${c.interpretation}`)
    }
  }
  return lines
}
