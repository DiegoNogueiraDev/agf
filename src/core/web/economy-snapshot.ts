/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * economy-snapshot — pure builder for GET /api/economy (web dashboard, EconomySnapshot CT1).
 *
 * WHY: the local dashboard shows real token economy from the store. This module
 * is PURE (store in → snapshot out) so the route stays a thin wire. It does NOT
 * write SQL: it composes the existing aggregators —
 *   summarizeLedger   (observability/llm-call-ledger.ts) → totals tokens/cost
 *   getCumulativeSavings (economy/savings-tracker.ts)    → saved + savingsRate
 *   summarizeByLever  (economy/economy-lever-ledger.ts)  → per-lever savings
 * Empty store → zeroed totals and levers:[] (never null). Imitates progress-snapshot.ts.
 */
import { summarizeLedger } from '../observability/llm-call-ledger.js'
import { getCumulativeSavings } from '../economy/savings-tracker.js'
import { summarizeByLever, type LeverSummary } from '../economy/economy-lever-ledger.js'
import { calculateCostWithPricing } from '../observability/cost-tracker.js'
import { computeCacheStats } from '../llm/cache-stats.js'
import { buildProofSnapshot, type ProofCommandRow, type ProofScaffoldReuse } from '../economy/proof-snapshot.js'
import type { SqliteStore } from '../store/sqlite-store.js'
import { LEVER_KEYS, resolveEconomyLeversConfig } from '../economy/economy-levers-config.js'
import { leverListState } from '../economy/lever-list-state.js'
import { resolveEffectiveLevers } from '../autonomy/task-prep.js'

/** Aggregate token/cost totals shown at the top of the economy view. */
export interface EconomyTotals {
  tokensIn: number
  tokensOut: number
  /** cached_input_tokens sum (cheaper prefix-cache hits). */
  cache: number
  saved: number
  /** Dollar value of the saved tokens (what they would have cost at current pricing). */
  savedUsd: number
  /** Actual USD spent on LLM calls (0 in delegate-first mode — correct, not a bug). */
  costUsd: number
}

/**
 * Delegate-first economy: agf emits compact command output to the external
 * orchestrator instead of it reading the raw graph each call. This is THE
 * headline metric now that an external agent drives the tool. null when no
 * commands have been recorded yet.
 */
export interface DelegateEconomyView {
  cmdCalls: number
  /** Tokens agf actually emitted to the orchestrator. */
  cmdTok: number
  /** Tokens it would have cost to read the raw graph × calls. */
  baselineTok: number
  /** Bounded counterfactual bytes (one full read × active days) — the honest "raw graph avoided". */
  baselineBytes: number
  delegateSaved: number
  savedPct: number
  avgTokPerCmd: number
  baselineExtrapolated: boolean
}

/** Local prefix-cache economy — yes, the local cache counts toward savings. */
export interface CacheEconomyView {
  /** 0–100 fraction of calls that hit the cache. */
  hitRate: number
  totalHits: number
  totalMisses: number
  tokensSaved: number
  estimatedSavingsUsd: number
}

/** agf CLI usage by the external agent (drives the delegate economy). */
export interface CommandEconomyView {
  calls: number
  estimatedTokens: number
  /** Raw graph bytes the agent would have had to read without agf's compact output. */
  graphExportBytes: number
  avgDurationMs: number
}

/** Exact shape returned by GET /api/economy and consumed by the view. */
/** Um lever e por que ele está (ou não) ativo — o que a UI precisa para ser honesta. */
export interface LeverStateView {
  name: string
  enabled: boolean
  source: 'config' | 'auto-bundle' | 'none'
}

export interface EconomySnapshot {
  totals: EconomyTotals
  /** Savings rate as a percent, 0–100. */
  savingsRate: number
  levers: LeverSummary[]
  /** Delegate-first economy (null until the agent runs agf commands). */
  delegate: DelegateEconomyView | null
  /** Local prefix-cache economy. */
  cache: CacheEconomyView
  /** agf CLI command usage. */
  commands: CommandEconomyView
  /** Per-command savings breakdown (reused from proof-snapshot.ts — same cross-surface shape as CLI/TUI). */
  byCommand: ProofCommandRow[]
  /**
   * Estado ATIVO de cada lever, com a origem do "ligado".
   *
   * A tab mostrava só o quanto cada lever poupou, então cinco levers
   * auto-ativados pelo bundle rodavam invisíveis para o consumidor visual
   * (node_f9978e124d06). Deriva do MESMO `leverListState` que o CLI usa — duas
   * superfícies do mesmo produto discordando sobre o que está rodando seria pior
   * que nenhuma das duas mostrar.
   */
  leverStates: LeverStateView[]
  /** RAG-OUT scaffold reuse (reused from proof-snapshot.ts). */
  scaffoldReuse: ProofScaffoldReuse
}

/** Build the economy snapshot by composing existing ledger aggregators (zero new SQL). */
export function buildEconomySnapshot(store: SqliteStore): EconomySnapshot {
  const db = store.getDb()
  const ledger = summarizeLedger(db).totals
  const savings = getCumulativeSavings(store)
  const levers = summarizeByLever(db)
  // Efetivo (config + bundle auto-ativado) vs persistido: o primeiro é o que
  // roda, o segundo diz de onde veio. Ver lever-list-state.ts.
  const persisted = resolveEconomyLeversConfig(store)
  const effective = resolveEffectiveLevers(store)
  const leverStates: LeverStateView[] = LEVER_KEYS.map((name) => ({
    name,
    ...leverListState(name, persisted, effective),
  }))

  // Real $ economy: value the saved tokens at current input pricing — what they
  // WOULD have cost. In delegate-first mode costUsd is 0 (no LLM billed here),
  // so savedUsd is the meaningful dollar figure to surface.
  const savedUsd = calculateCostWithPricing(savings.pricing, savings.totalSaved, 0, 0).totalUsd

  const d = savings.delegateEconomy
  const delegate: DelegateEconomyView | null = d
    ? {
        cmdCalls: d.cmdCalls,
        cmdTok: d.cmdTok,
        baselineTok: d.baselineTok,
        baselineBytes: d.baselineBytes,
        delegateSaved: d.delegateSaved,
        savedPct: d.savedPct,
        avgTokPerCmd: d.avgTokPerCmd,
        baselineExtrapolated: d.baselineExtrapolated ?? false,
      }
    : null

  const c = computeCacheStats(db)
  const cache: CacheEconomyView = {
    hitRate: c.hitRate,
    totalHits: c.totalHits,
    totalMisses: c.totalMisses,
    tokensSaved: c.tokensSaved,
    estimatedSavingsUsd: c.estimatedSavingsUsd,
  }

  const cmd = savings.commands
  const commands: CommandEconomyView = {
    calls: cmd?.calls ?? 0,
    estimatedTokens: cmd?.estimatedTokens ?? 0,
    graphExportBytes: cmd?.graphExportBytes ?? 0,
    avgDurationMs: cmd?.avgDurationMs ?? 0,
  }

  const proof = buildProofSnapshot(store)

  return {
    leverStates,
    totals: {
      tokensIn: ledger.tokensIn,
      tokensOut: ledger.tokensOut,
      cache: ledger.cachedTokensIn,
      saved: savings.totalSaved,
      savedUsd,
      costUsd: ledger.costUsd,
    },
    savingsRate: savings.savingsRate,
    levers,
    delegate,
    cache,
    commands,
    byCommand: proof.byCommand,
    scaffoldReuse: proof.scaffoldReuse,
  }
}
