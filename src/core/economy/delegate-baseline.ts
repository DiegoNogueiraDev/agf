/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * What the delegate-mode economy figure is, and what it is not.
 *
 * `agf` makes no LLM calls in delegate mode — `llm_call_ledger` is empty and that is correct. So
 * the CLI's "economy" is a counterfactual: tokens an external agent did not spend because the CLI
 * answered instead. The counterfactual chosen was `graph_export_bytes / 4 × calls` — every one of
 * 17,472 invocations standing in for a dump of the entire graph. That produced
 * "7458030432 tok economizados (99%)", and nobody dumps the whole graph seventeen thousand times.
 *
 * The arithmetic was never wrong; the premise was. A number that cannot be wrong cannot be
 * evidence, and this one was loud enough to discredit the 6,991 tokens the lever ledger measured
 * against a baseline you can actually argue with.
 *
 * So the figure stays — an upper bound is worth something — but it travels with the name of the
 * counterfactual that produced it, and the word "saved" is left to the levers that measured.
 *
 * Contract: `describeDelegateEconomy(e)` renders the one line `agf metrics` prints. It states what
 * was measured (calls, tokens emitted) before what was assumed (the baseline, by name).
 */

/**
 * The counterfactual: each CLI call replaced reading the whole graph. An upper bound, and a loose
 * one. Named so a reader can reject it.
 */
export const DELEGATE_BASELINE_METHOD = 'full_graph_dump' as const

export type DelegateBaselineMethod = typeof DELEGATE_BASELINE_METHOD

/** Inputs for bounding the delegate counterfactual to a defensible upper limit. */
export interface DelegateBaselineInput {
  /** Σ(graph_export_bytes) over every call — the raw, over-counted counterfactual. */
  rawBytes: number
  /** Bytes of one full graph read (the largest export seen ≈ current graph size). */
  perReadBytes: number
  /** Distinct active work-days — the read-episode count (agent reloads context ~1×/day). */
  episodes: number
}

/** Result of {@link boundDelegateBaseline}: the bounded byte count + whether the cap bit. */
export interface DelegateBaselineResult {
  baselineBytes: number
  /** true when the raw counterfactual exceeded the bound and was clamped (→ show as an estimate). */
  bounded: boolean
}

/**
 * Bound the delegate counterfactual. The raw sum `Σ(full graph per call)` treats every CLI
 * call as a whole-graph read, which compounds to absurd multi-GB / multi-billion-token figures
 * as calls accumulate — "loud enough to discredit" the lever ledger's measured savings (see the
 * module header). Cap it at ONE full read per active day: still an upper bound, but one a reader
 * can argue with. `episodes` floors at 1 so a single-day project still counts one full read.
 */
export function boundDelegateBaseline(input: DelegateBaselineInput): DelegateBaselineResult {
  const rawBytes = Math.max(0, input.rawBytes || 0)
  const perReadBytes = Math.max(0, input.perReadBytes || 0)
  const episodes = Math.max(1, Math.floor(input.episodes) || 1)
  const cap = perReadBytes * episodes
  // cap === 0 means no graph data was ever recorded → nothing credible to bound; keep raw (also 0).
  const baselineBytes = cap > 0 ? Math.min(rawBytes, cap) : rawBytes
  return { baselineBytes, bounded: cap > 0 && cap < rawBytes }
}

/** Shape needed to describe the figure. Structurally satisfied by `DelegateEconomy`. */
interface Describable {
  cmdCalls: number
  cmdTok: number
  baselineTok: number
  savedPct: number
  baselineMethod?: DelegateBaselineMethod
}

/** Measured first, assumed second, and the assumption wears its name. */
export function describeDelegateEconomy(economy: Describable): string {
  const method = economy.baselineMethod ?? DELEGATE_BASELINE_METHOD

  if (economy.cmdCalls === 0 || economy.baselineTok === 0) {
    return `⚡ Modo delegate — llm_tok=0 é esperado. Nenhuma invocação de CLI medida ainda.`
  }

  return (
    `⚡ Modo delegate — llm_tok=0 é esperado. ` +
    `Medido: ${economy.cmdCalls} invocações de CLI, ${economy.cmdTok} tokens emitidos. ` +
    `Contra o baseline hipotético '${method}' (cada chamada substituindo um dump do grafo inteiro), ` +
    `isso é ${economy.savedPct}% — um teto, não uma medição. ` +
    `A economia medida está em 'agf savings' (baseline por lever).`
  )
}
