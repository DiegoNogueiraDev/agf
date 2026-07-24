/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Baseline da fatura — decompositor executável dos 3 termos do modelo de custo
 * (§1 do `odysseus token budget v2`): input cheio · prefixo cacheado · output.
 * Reconstrói o **baseline contrafactual** (sem cache, sem compressão) sobre o
 * `llm_call_ledger` real e emite o **veredito do §6** (comprimir contexto vale,
 * ou o output domina e o retorno é decrescente?). Token-first: funciona a $0 no
 * modelo local (decompõe por volume); $ quando o modelo tem preço cadastrado.
 *
 * É a contraparte executável de `docs/reference/calculos-do-projeto.md`.
 */
import type Database from 'better-sqlite3'
import { getModelPricing, calculateCost, CACHE_HIT_RATE, MODEL_PRICING } from './cost-tracker.js'
import { summarizeByLever } from '../economy/economy-lever-ledger.js'
import { successfulNodeIds } from '../store/episodic-outcomes-store.js'

/** Razão de output presumida (p_out/p_in) p/ modelos sem preço (local). Doc §1. */
const DEFAULT_OUTPUT_WEIGHT = 2
/** Limiar de dominância p/ o veredito (§6). */
const DOMINANCE = 0.6

export interface BaselineTerm {
  usd: number
  tokens: number
  /** Fração do custo "ponderado" (unidades de p_in) — vale mesmo a $0. */
  share: number
}

export interface BaselineReport {
  hasData: boolean
  priced: boolean
  models: string[]
  inputFull: BaselineTerm
  cachePaid: BaselineTerm
  output: BaselineTerm
  actualUsd: number
  tokensIn: number
  cachedTokens: number
  tokensOut: number
  reasoningTokens: number
  cacheSavedUsd: number
  leverSavedTokens: number
  leverSavedUsd: number
  baselineTotalUsd: number
  economiaUsd: number
  economiaPct: number
  fator: number
  cacheHitRatio: number
  reasonShare: number
  inputShare: number
  outputShare: number
  verdict: string
  warnings: string[]
  succeeded: number
  costPerSuccess: number | null
  baselineCostPerSuccess: number | null
}

interface ModelAgg {
  model: string
  tokensIn: number
  cached: number
  tokensOut: number
  reasoning: number
}

function aggregateByModel(db: Database.Database, sessionId?: string): ModelAgg[] {
  const where = sessionId ? 'WHERE session_id = ?' : ''
  const rows = db
    .prepare(
      `SELECT model,
              COALESCE(SUM(input_tokens), 0) AS tokensIn,
              COALESCE(SUM(cached_input_tokens), 0) AS cached,
              COALESCE(SUM(output_tokens), 0) AS tokensOut,
              COALESCE(SUM(reasoning_tokens), 0) AS reasoning
         FROM llm_call_ledger ${where}
        GROUP BY model`,
    )
    .all(...(sessionId ? [sessionId] : [])) as ModelAgg[]
  return rows
}

/** Decompõe a fatura real nos 3 termos do §1 + baseline contrafactual + veredito §6. */
export function summarizeBaseline(db: Database.Database, opts: { sessionId?: string } = {}): BaselineReport {
  const aggs = aggregateByModel(db, opts.sessionId)

  let inputFullUsd = 0
  let cachePaidUsd = 0
  let outputUsd = 0
  let cacheSavedUsd = 0
  // Unidades ponderadas (p_in=1, p_cache=CACHE_HIT_RATE, p_out=rate_out/rate_in) —
  // funcionam mesmo sem preço, dando shares/veredito a $0.
  let unitInputFull = 0
  let unitCache = 0
  let unitOutput = 0
  let tokensIn = 0
  let cachedTokens = 0
  let tokensOut = 0
  let reasoningTokens = 0
  let priced = false
  // Rate de input do modelo com mais tokens (p/ converter economia de lever a $).
  let domTokens = -1
  let domInputRate = 0
  const models: string[] = []

  for (const a of aggs) {
    models.push(a.model)
    const pricing = getModelPricing(a.model)
    const fullIn = a.tokensIn - a.cached
    let wOut = DEFAULT_OUTPUT_WEIGHT
    if (pricing) {
      priced = true
      inputFullUsd += (fullIn * pricing.inputPer1M) / 1e6
      cachePaidUsd += (a.cached * pricing.inputPer1M * CACHE_HIT_RATE) / 1e6
      outputUsd += (a.tokensOut * pricing.outputPer1M) / 1e6
      cacheSavedUsd += (a.cached * pricing.inputPer1M * (1 - CACHE_HIT_RATE)) / 1e6
      wOut = pricing.inputPer1M > 0 ? pricing.outputPer1M / pricing.inputPer1M : DEFAULT_OUTPUT_WEIGHT
      if (a.tokensIn > domTokens) {
        domTokens = a.tokensIn
        domInputRate = pricing.inputPer1M
      }
    }
    unitInputFull += fullIn
    unitCache += a.cached * CACHE_HIT_RATE
    unitOutput += a.tokensOut * wOut
    tokensIn += a.tokensIn
    cachedTokens += a.cached
    tokensOut += a.tokensOut
    reasoningTokens += a.reasoning
  }

  const actualUsd = inputFullUsd + cachePaidUsd + outputUsd
  const unitTotal = unitInputFull + unitCache + unitOutput || 1
  const inputShare = (unitInputFull + unitCache) / unitTotal
  const outputShare = unitOutput / unitTotal

  // Economia determinística (levers) — tokens que nunca viraram chamada.
  const levers = summarizeByLever(db, opts.sessionId)
  const leverSavedTokens = levers.reduce((s, l) => s + l.totalSaved, 0)
  const leverSavedUsd = (leverSavedTokens * domInputRate) / 1e6

  const baselineTotalUsd = actualUsd + cacheSavedUsd + leverSavedUsd
  const economiaUsd = baselineTotalUsd - actualUsd
  const economiaPct = baselineTotalUsd > 0 ? economiaUsd / baselineTotalUsd : 0
  const fator = actualUsd > 0 ? baselineTotalUsd / actualUsd : 1

  const cacheHitRatio = tokensIn > 0 ? cachedTokens / tokensIn : 0
  const reasonShare = tokensOut > 0 ? reasoningTokens / tokensOut : 0

  // Veredito do §6 (onde foi o dinheiro → comprimir contexto vale?).
  const pctInput = Math.round(inputShare * 100)
  const pctOutput = Math.round(outputShare * 100)
  let verdict: string
  if (outputShare >= DOMINANCE) {
    verdict = `Output domina (${pctOutput}%). Comprimir contexto/input tem retorno decrescente (§6 — pare). Foque effort/output e reuse.`
  } else if (inputShare >= DOMINANCE) {
    verdict = `Input/contexto domina (${pctInput}%). Compressão de conteúdo / cache de prefixo podem valer — meça lever a lever.`
  } else {
    verdict = `Equilibrado (input ${pctInput}% / output ${pctOutput}%). Ganho marginal moderado em ambos os lados.`
  }

  const warnings: string[] = []
  if (cachedTokens === 0 && tokensIn > 0) {
    warnings.push('Sem cache de prefixo (C=0) — ative prefixo estável ou use um provider que cacheia (§6 Frente B).')
  } else if (cachedTokens > 0 && cacheHitRatio < 0.9) {
    warnings.push(
      `Cache de prefixo em ${Math.round(cacheHitRatio * 100)}% (<90%) — algo muta o prefixo (§6 — investigar).`,
    )
  }
  if (reasonShare > 0.5) {
    warnings.push(
      `Raciocínio = ${Math.round(reasonShare * 100)}% do output — possível overthinking; revise o effort-router (§6 Frente C).`,
    )
  }
  if (!priced && tokensIn + tokensOut > 0) {
    warnings.push('Modelo(s) sem preço cadastrado (ex.: local) — decomposição por volume de tokens; $ = 0.')
  }

  // Cost per success: quantas tasks tiveram ao menos um outcome de sucesso
  const succeeded = successfulNodeIds(db).size
  const costPerSuccess = succeeded > 0 ? actualUsd / succeeded : null
  const baselineCostPerSuccess = succeeded > 0 ? baselineTotalUsd / succeeded : null

  const term = (usd: number, tokens: number, unit: number): BaselineTerm => ({
    usd,
    tokens,
    share: unit / unitTotal,
  })

  return {
    hasData: tokensIn + tokensOut > 0,
    priced,
    models,
    inputFull: term(inputFullUsd, tokensIn - cachedTokens, unitInputFull),
    cachePaid: term(cachePaidUsd, cachedTokens, unitCache),
    output: term(outputUsd, tokensOut, unitOutput),
    actualUsd,
    tokensIn,
    cachedTokens,
    tokensOut,
    reasoningTokens,
    cacheSavedUsd,
    leverSavedTokens,
    leverSavedUsd,
    baselineTotalUsd,
    economiaUsd,
    economiaPct,
    fator,
    cacheHitRatio,
    reasonShare,
    inputShare,
    outputShare,
    verdict,
    warnings,
    succeeded,
    costPerSuccess,
    baselineCostPerSuccess,
  }
}

// ── Simulação cross-provider (pior caso → baseline de melhoria) ───────────────

export interface ModelSimRow {
  model: string
  inputPer1M: number
  outputPer1M: number
  usd: number
  /** Multiplicador vs o modelo mais barato com preço. */
  factor: number
}

export interface SimulateReport {
  tokensIn: number
  cachedTokens: number
  tokensOut: number
  rows: ModelSimRow[]
  cheapestUsd: number
  worstUsd: number
  /** Razão pior/mais-barato — a margem de melhoria entre providers. */
  spread: number
}

/**
 * Re-precifica o MESMO perfil de tokens (real, do ledger) sob TODOS os modelos
 * do catálogo — simula outros providers SEM conectar. O topo é o pior caso
 * (ex.: opus); o fundo é o que pagamos. A razão é a margem de melhoria.
 */
export function simulateProviders(tokensIn: number, cachedTokens: number, tokensOut: number): SimulateReport {
  const seen = new Set<string>()
  const rows: ModelSimRow[] = []
  for (const [model, pricing] of MODEL_PRICING) {
    if (model.endsWith('/')) continue // entrada de prefixo (dup) — pula
    if (seen.has(model)) continue
    seen.add(model)
    const usd = calculateCost(model, tokensIn, tokensOut, cachedTokens).totalUsd
    rows.push({ model, inputPer1M: pricing.inputPer1M, outputPer1M: pricing.outputPer1M, usd, factor: 1 })
  }
  rows.sort((a, b) => b.usd - a.usd)
  const priced = rows.filter((r) => r.usd > 0)
  const cheapestUsd = priced.length > 0 ? Math.min(...priced.map((r) => r.usd)) : 0
  const worstUsd = rows.length > 0 ? rows[0].usd : 0
  for (const r of rows) r.factor = cheapestUsd > 0 ? r.usd / cheapestUsd : 0
  return {
    tokensIn,
    cachedTokens,
    tokensOut,
    rows,
    cheapestUsd,
    worstUsd,
    spread: cheapestUsd > 0 ? worstUsd / cheapestUsd : 0,
  }
}

/** Renderiza a simulação cross-provider. */
export function formatSimulate(r: SimulateReport): string[] {
  if (r.tokensIn + r.tokensOut === 0) {
    return ['Sem dados no llm_call_ledger. Rode `agf deliver --live` / `autopilot --live` primeiro.']
  }
  const usd = (n: number): string => `$${n.toFixed(4)}`
  const lines = [
    `Simulação cross-provider — MESMO trabalho (${r.tokensIn} in / ${r.tokensOut} out, cache ${r.cachedTokens}) sob cada modelo:`,
    '',
    `  ${'modelo'.padEnd(26)} ${'in/out $/1M'.padEnd(14)} ${'custo'.padStart(10)}  fator`,
    `  ${'-'.repeat(60)}`,
  ]
  for (const row of r.rows) {
    const rate = `${row.inputPer1M}/${row.outputPer1M}`
    const factor = row.usd > 0 ? `${row.factor.toFixed(1)}×` : '—'
    lines.push(`  ${row.model.padEnd(26)} ${rate.padEnd(14)} ${usd(row.usd).padStart(10)}  ${factor}`)
  }
  lines.push('')
  lines.push(
    `Pior caso: ${usd(r.worstUsd)} (${r.rows[0]?.model}) · mais barato: ${usd(r.cheapestUsd)} · margem ${r.spread.toFixed(0)}×.`,
  )
  lines.push('Mesmo trabalho, mesma acurácia esperada — a escolha de modelo/rota é a maior alavanca de $.')
  return lines
}

function bar(share: number, width = 20): string {
  const filled = Math.round(share * width)
  return '█'.repeat(filled) + '·'.repeat(Math.max(0, width - filled))
}

/** Renderiza o relatório de baseline em linhas amigáveis (texto). */
export function formatBaseline(r: BaselineReport): string[] {
  if (!r.hasData) {
    return [
      'Sem dados no llm_call_ledger. Rode `agf deliver --live` ou `autopilot --live` (Ollama local = $0, mas registra tokens).',
    ]
  }
  const usd = (n: number): string => `$${n.toFixed(4)}`
  const pct = (n: number): string => `${Math.round(n * 100)}%`
  const lines: string[] = []
  lines.push('Baseline da fatura — decomposição nos 3 termos (§1):', '')
  lines.push(
    `  ${'input cheio'.padEnd(16)} ${bar(r.inputFull.share)} ${pct(r.inputFull.share).padStart(4)}  ${r.inputFull.tokens} tok  ${usd(r.inputFull.usd)}`,
  )
  lines.push(
    `  ${'cache prefixo'.padEnd(16)} ${bar(r.cachePaid.share)} ${pct(r.cachePaid.share).padStart(4)}  ${r.cachePaid.tokens} tok  ${usd(r.cachePaid.usd)}`,
  )
  lines.push(
    `  ${'output'.padEnd(16)} ${bar(r.output.share)} ${pct(r.output.share).padStart(4)}  ${r.output.tokens} tok  ${usd(r.output.usd)}`,
  )
  lines.push('', `  Custo atual: ${usd(r.actualUsd)}  (input ${pct(r.inputShare)} · output ${pct(r.outputShare)})`)
  lines.push('')
  lines.push('Baseline contrafactual (sem cache + sem compressão):')
  lines.push(`  Cache (Frente B) já economizou: ${usd(r.cacheSavedUsd)}`)
  if (r.leverSavedTokens > 0) {
    lines.push(
      `  Determinístico (levers): ${r.leverSavedTokens} tok evitados ≈ ${usd(r.leverSavedUsd)} (estimativa input-side)`,
    )
  }
  lines.push(
    `  → Baseline: ${usd(r.baselineTotalUsd)}  |  Economia: ${usd(r.economiaUsd)} (${pct(r.economiaPct)}, fator ${r.fator.toFixed(2)}×)`,
  )
  lines.push('')
  lines.push('Sinais do §6:')
  lines.push(
    `  Cache hit (C/T_in): ${pct(r.cacheHitRatio)} ${r.cachedTokens > 0 && r.cacheHitRatio < 0.9 ? '(< 90% — investigar)' : ''}`,
  )
  lines.push(`  Raciocínio/output (T_reason/T_resp): ${pct(r.reasonShare)}`)
  lines.push('')
  if (r.succeeded > 0 && r.costPerSuccess !== null) {
    lines.push('Custo por sucesso:')
    lines.push(`  Atual: ${usd(r.costPerSuccess)}/task  (${r.succeeded} sucessos em ${r.models.join(', ')})`)
    if (r.baselineCostPerSuccess !== null) {
      lines.push(`  Baseline: ${usd(r.baselineCostPerSuccess)}/task  (contrafactual sem cache/compressão)`)
      lines.push(
        `  Economia por sucesso: ${usd(r.baselineCostPerSuccess - r.costPerSuccess)} (${pct((r.baselineCostPerSuccess - r.costPerSuccess) / r.baselineCostPerSuccess)})`,
      )
    }
    lines.push('')
  }
  lines.push(`Veredito: ${r.verdict}`)
  for (const w of r.warnings) lines.push(`  ⚠ ${w}`)
  return lines
}
