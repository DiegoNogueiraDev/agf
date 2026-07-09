/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Scorecard do eval — agrega os resultados de cenário (por tier e por modelo) nas
 * métricas dos 3 pilares: **resolve%** (best-practice/correção), **custo-por-sucesso**
 * (token, a métrica honesta da Microsoft), **tokens/task** e **p50/p95 latência**
 * (rápido). Puro: alimenta a decisão de estado-da-arte. `formatScorecard` rende.
 */

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
