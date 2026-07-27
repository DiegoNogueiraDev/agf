/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Repo-map ranqueado (M1m) — contexto estrutural compacto p/ o prompt: os
 * símbolos mais "importantes" do projeto (os mais referenciados), ranqueados
 * por PageRank, dentro de um orçamento de tokens. Corta tokens de ENTRADA e
 * reduz alucinação, sem nunca despejar arquivos inteiros.
 *
 * Técnica do Aider (repo-map) / opencode (LSP symbols), reimplementada aqui:
 * PageRank por power-iteration (zero dependência — `graphology-metrics` não
 * está no projeto), puro e determinístico.
 */
import { estimateTokens } from '../autonomy/token-ledger.js'
import { heatKernelRelevance } from './heat-kernel.js'
import { estimateTokensCalibrated } from './zipf-estimator.js'
import { selectByMarginalValue } from './marginal-value-stop.js'

/** Subconjunto de `CodeSymbol` necessário ao mapa (estruturalmente compatível). */
export interface RepoMapSymbol {
  id: string
  name: string
  file: string
  startLine: number
  signature?: string | null
  exported?: boolean
}

/** Subconjunto de `CodeRelation` (aresta de referência fromSymbol → toSymbol). */
export interface RepoMapRelation {
  fromSymbol: string
  toSymbol: string
}

export interface RepoMapOptions {
  /** Orçamento de tokens do mapa (estimado por chars/4). */
  tokenBudget: number
  /** Termo de foco (nome/arquivo) cujos símbolos recebem boost de ranking. */
  focus?: string
  /**
   * Ranker de relevância (opt-in). `pagerank` (default) = importância global por
   * referências; `heat_kernel` = difusão `e^{-tL}` semeada no símbolo de `focus`
   * (relevância de vizinhança em vez de global). Sem `focus` casável → pagerank.
   */
  ranker?: 'pagerank' | 'heat_kernel'
  /**
   * Zipf-calibrated chars/token ratio for budget estimation (opt-in `zipf_estimate`
   * lever). When set, budgets use `estimateTokensCalibrated` with this ratio instead
   * of the fixed `chars/4`. Undefined ⇒ legacy estimator (byte-identical).
   */
  charsPerToken?: number
  /**
   * Stigmergy pheromone boost: map from file path ⇒ boost multiplier.
   * Symbols whose file has a strong pheromone trail get their score amplified
   * so the repo-map surfaces files that prior successful tasks touched.
   * Only active when the `stigmergy` lever is on.
   */
  pheromoneBoost?: Map<string, number>
  /**
   * Marginal-value stop (opt-in `forage_stop` lever): stop including ranked symbols
   * once the next symbol's information gain per token falls below the habitat-average
   * rate (Charnov's MVT patch-leaving), instead of filling the whole `tokenBudget`.
   * The budget still acts as a hard ceiling. Undefined/false ⇒ legacy budget-only
   * truncation (byte-identical).
   */
  forageStop?: boolean
}

export interface RepoMap {
  /** Texto formatado pronto p/ injetar no prompt (vazio se sem símbolos). */
  text: string
  /** Quantos símbolos entraram no orçamento. */
  included: number
  /** Tokens estimados do `text`. */
  tokensEstimated: number
  /**
   * Baseline (A3): tokens estimados se TODOS os símbolos candidatos fossem
   * despejados (dump-all), sem ranqueamento nem budget. A economia de input do
   * repo-map é `fullEstimated - tokensEstimated` (≥ 0). Permite registrar o
   * corte de entrada como lever no ledger.
   */
  fullEstimated: number
  /** Ranker efetivamente usado (heat-kernel só ativa com seed de `focus`). */
  rankSource: 'pagerank' | 'heat_kernel'
  /**
   * Tokens cortados ADICIONALMENTE pelo `forage_stop` (MVT) além do que o budget já
   * cortaria — i.e., quando a regra de valor marginal para antes do teto. 0 quando o
   * lever está off ou não houve corte extra. Permite registrar o lever `forage_stop`.
   */
  forageSavedTokens: number
}

const DAMPING = 0.85
const ITERATIONS = 30
const FOCUS_BOOST = 3

/**
 * PageRank por power-iteration sobre as arestas `from → to`. Nós sem id de
 * símbolo conhecido são ignorados; nós-dangling redistribuem uniformemente.
 */
function pagerank(ids: string[], relations: RepoMapRelation[]): Map<string, number> {
  const n = ids.length
  const known = new Set(ids)
  const out = new Map<string, string[]>()
  for (const id of ids) out.set(id, [])
  for (const rel of relations) {
    if (known.has(rel.fromSymbol) && known.has(rel.toSymbol)) {
      const links = out.get(rel.fromSymbol)
      if (links) links.push(rel.toSymbol)
    }
  }

  let rank = new Map<string, number>(ids.map((id) => [id, 1 / n]))
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const next = new Map<string, number>(ids.map((id) => [id, (1 - DAMPING) / n]))
    let dangling = 0
    for (const id of ids) {
      const links = out.get(id) ?? []
      const score = rank.get(id) ?? 0
      if (links.length === 0) {
        dangling += score
        continue
      }
      const share = (DAMPING * score) / links.length
      for (const to of links) next.set(to, (next.get(to) ?? 0) + share)
    }
    // dangling mass redistribuída uniformemente (mantém soma ≈ 1)
    const danglingShare = (DAMPING * dangling) / n
    if (danglingShare > 0) {
      for (const id of ids) next.set(id, (next.get(id) ?? 0) + danglingShare)
    }
    rank = next
  }
  return rank
}

/** Formata uma linha compacta para um símbolo. */
function formatLine(symbol: RepoMapSymbol): string {
  const sig = symbol.signature?.trim() || symbol.name
  return `${symbol.file}:${symbol.startLine} ${sig}`
}

/**
 * Monta o repo-map: ranqueia os símbolos por PageRank (com boost de `focus`),
 * formata do mais relevante ao menos, acumulando até `tokenBudget`.
 */
export function buildRepoMap(
  input: { symbols: RepoMapSymbol[]; relations: RepoMapRelation[] },
  options: RepoMapOptions,
): RepoMap {
  const { symbols, relations } = input
  if (symbols.length === 0) {
    return { text: '', included: 0, tokensEstimated: 0, fullEstimated: 0, rankSource: 'pagerank', forageSavedTokens: 0 }
  }

  const ids = symbols.map((s) => s.id)
  const focus = options.focus?.toLowerCase()

  // Heat-kernel ranking (opt-in): diffuse relevance from the focus seed symbol.
  // Falls back to global PageRank when no focus symbol matches (no valid seed).
  let rank: Map<string, number>
  let rankSource: 'pagerank' | 'heat_kernel' = 'pagerank'
  const seed =
    options.ranker === 'heat_kernel' && focus
      ? symbols.find((s) => s.name.toLowerCase().includes(focus) || s.file.toLowerCase().includes(focus))
      : undefined
  if (seed) {
    const heat = heatKernelRelevance(
      { nodes: ids, edges: relations.map((r): [string, string] => [r.fromSymbol, r.toSymbol]) },
      seed.id,
    )
    rank = new Map(Object.entries(heat))
    rankSource = 'heat_kernel'
  } else {
    rank = pagerank(ids, relations)
  }

  const scored = symbols.map((symbol) => {
    let score = rank.get(symbol.id) ?? 0
    if (focus && (symbol.name.toLowerCase().includes(focus) || symbol.file.toLowerCase().includes(focus))) {
      score *= FOCUS_BOOST
    }
    if (options.pheromoneBoost) {
      const boost = options.pheromoneBoost.get(symbol.file)
      if (boost !== undefined && boost > 1) score *= boost
    }
    return { symbol, score }
  })
  // ordena por score desc; desempate determinístico: exported primeiro, depois nome
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if ((b.symbol.exported ? 1 : 0) !== (a.symbol.exported ? 1 : 0)) {
      return (b.symbol.exported ? 1 : 0) - (a.symbol.exported ? 1 : 0)
    }
    return a.symbol.name.localeCompare(b.symbol.name)
  })

  // Zipf-calibrated budget estimator (opt-in): chars/token ratio instead of chars/4.
  const est = (s: string): number =>
    options.charsPerToken !== undefined ? estimateTokensCalibrated(s, options.charsPerToken) : estimateTokens(s)

  const header = 'Repo-map (símbolos por relevância):'
  // Baseline dump-all (A3): todos os candidatos formatados, sem budget.
  const fullEstimated = est(`${header}\n${scored.map(({ symbol }) => formatLine(symbol)).join('\n')}`)

  // Budget ceiling: include ranked symbols until the token budget is hit.
  let budgetIncluded = 0
  for (let i = 0; i < scored.length; i++) {
    const candidate = `${header}\n${scored
      .slice(0, i + 1)
      .map((s) => formatLine(s.symbol))
      .join('\n')}`
    if (est(candidate) > options.tokenBudget) break
    budgetIncluded += 1
  }

  // Marginal-value stop (opt-in): cut earlier than the budget when the gain/token of
  // the next symbol drops below the habitat-average rate (Charnov MVT patch-leaving).
  let included = budgetIncluded
  if (options.forageStop && budgetIncluded > 1) {
    const minScore = Math.min(...scored.map((s) => s.score))
    const items = scored.map((s) => ({ gain: s.score - minScore + 1, tokens: Math.max(1, est(formatLine(s.symbol))) }))
    const forageTaken = selectByMarginalValue(items).takenCount
    included = Math.min(budgetIncluded, forageTaken)
  }

  if (included === 0)
    return { text: '', included: 0, tokensEstimated: 0, fullEstimated, rankSource, forageSavedTokens: 0 }

  const finalText = `${header}\n${scored
    .slice(0, included)
    .map((s) => formatLine(s.symbol))
    .join('\n')}`
  const tokensEstimated = est(finalText)
  // forage saving = what the budget would have included minus what forage kept.
  let forageSavedTokens = 0
  if (options.forageStop && included < budgetIncluded) {
    const budgetText = `${header}\n${scored
      .slice(0, budgetIncluded)
      .map((s) => formatLine(s.symbol))
      .join('\n')}`
    forageSavedTokens = Math.max(0, est(budgetText) - tokensEstimated)
  }
  return { text: finalText, included, tokensEstimated, fullEstimated, rankSource, forageSavedTokens }
}
