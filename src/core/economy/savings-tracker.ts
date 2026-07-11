/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * E1 — Savings Tracker: cumulative token economy display after each agf done.
 * Tracks tokens in/out/cache per task, computes cost savings, and projects
 * remaining cost to zero the backlog.
 */
import type Database from 'better-sqlite3'
import { isTokenLever } from './lever-units.js'
import { DELEGATE_BASELINE_METHOD, boundDelegateBaseline, type DelegateBaselineMethod } from './delegate-baseline.js'
import type { SqliteStore } from '../store/sqlite-store.js'
import { summarizeLedger } from '../observability/llm-call-ledger.js'
import { summarizeCommandLedger, type CommandLedgerSummary } from '../observability/command-ledger.js'
import { summarizeByLever, type LeverSummary } from './economy-lever-ledger.js'
import { readEconomyFile, readProjectBlock, type ProjectBlock } from './token-economy-file.js'
import {
  getCustomPricing,
  formatPricing,
  calculateCostWithPricing,
  type CustomPricing,
} from '../observability/cost-tracker.js'

export interface DelegateEconomy {
  cmdCalls: number
  cmdTok: number // tokens emitted by agf to the external orchestrator
  baselineTok: number // tokens it would cost if the agent read the raw graph × calls
  baselineBytes: number // bounded counterfactual bytes (one full read × active days) — the honest "raw graph avoided"
  delegateSaved: number // baselineTok - cmdTok
  savedPct: number
  avgTokPerCmd: number
  baselineExtrapolated?: boolean // true when the raw Σ was clamped to the bound (show as a rough estimate)
  /** The counterfactual `baselineTok` was computed against. An upper bound, named so it can be rejected. */
  baselineMethod: DelegateBaselineMethod
}

export interface TaskSavings {
  nodeId: string
  title: string
  tokensIn: number
  tokensOut: number
  tokensCache: number
  saved: number
  cost: number
}

export interface SavingsReport {
  tasks: TaskSavings[]
  totals: { tokensIn: number; tokensOut: number; tokensCache: number; saved: number; cost: number }
  pricing: CustomPricing
  backlogCount: number
  projectedCost: number
  /** Universal command ledger — every agf subcommand invocation. */
  commands?: CommandLedgerSummary
  /** This project's block from the global token-economy.json. */
  economyBlock?: ProjectBlock
  /** Global totals across all projects. */
  globalTotals?: { projects: number; cmd_calls: number; combined_tok: number; cost: number }
  /** Per-lever economy (RAG in/out, compression, cache, reuse) from the ledger. */
  leverSavings?: LeverSummary[]
  /** Total tokens saved across all levers — the headline RAG/economy number. */
  leverSavedTotal?: number
  /** CLI economy when agf is operated by an external agent (delegate mode). */
  delegateEconomy?: DelegateEconomy
  /**
   * Flat headline savings (lever savings + task savings) — a single select-friendly
   * number for agents (`--select data.totalSaved`) instead of digging into nested totals.
   */
  totalSaved: number
  /**
   * Savings rate as a percent (0–100) — the delegate-mode `savedPct` when available,
   * else derived from saved vs consumed tokens. Select-friendly (`--select data.savingsRate`).
   */
  savingsRate: number
}

const SAVINGS_KEY = 'savings_cumulative'

/** Build the cumulative savings report from stored task ledger entries and global economy file. */
export function getCumulativeSavings(store: SqliteStore, projectDir?: string): SavingsReport {
  const pricing = getCustomPricing(store)
  const raw = store.getProjectSetting(SAVINGS_KEY)
  let tasks: TaskSavings[] = []
  if (raw) {
    try {
      tasks = JSON.parse(raw)
    } catch {
      tasks = []
    }
  }

  const totals = tasks.reduce(
    (acc, t) => ({
      tokensIn: acc.tokensIn + t.tokensIn,
      tokensOut: acc.tokensOut + t.tokensOut,
      tokensCache: acc.tokensCache + t.tokensCache,
      saved: acc.saved + t.saved,
      cost: acc.cost + t.cost,
    }),
    { tokensIn: 0, tokensOut: 0, tokensCache: 0, saved: 0, cost: 0 },
  )

  const stats = store.getStats()
  const backlogCount = stats.byStatus.backlog ?? 0

  const avgCostPerTask = tasks.length > 0 ? totals.cost / tasks.length : 0
  const projectedCost = avgCostPerTask * backlogCount

  const commands = summarizeCommandLedger(store.getDb())
  const economyBlock = projectDir ? readProjectBlock(projectDir) : undefined
  const globalFile = readEconomyFile()
  const globalTotals = {
    projects: globalFile.global_totals.projects,
    cmd_calls: globalFile.global_totals.cmd_calls,
    combined_tok: globalFile.global_totals.combined_tok,
    cost: globalFile.global_totals.cost,
  }

  const leverSavings = summarizeByLever(store.getDb())
  // Only levers whose `saved` is a token count. `scaffold_recovery` recorded a price — 1.5x the
  // structure, in relative cost units — for a recovery `rag_out_recovery` had already counted, and
  // summing both reported 398 tokens for a saving of 159. The rows stay; the total stops.
  const leverSavedTotal = leverSavings.filter((l) => isTokenLever(l.lever)).reduce((s, l) => s + l.totalSaved, 0)

  // Bound the delegate counterfactual. The raw Σ(graph_export_bytes) treats every call as a
  // whole-graph read, compounding to absurd multi-GB / multi-billion-token figures. Cap it at
  // one full read (maxGraphExportBytes ≈ current graph) per active day — a defensible upper
  // bound. Fall back to the per-call average when no max is recorded (pre-field dbs).
  const callsWithData = commands.callsWithGraphData ?? 0
  const rawBaselineBytes = commands.graphExportBytes ?? 0
  const perReadBytes =
    commands.maxGraphExportBytes && commands.maxGraphExportBytes > 0
      ? commands.maxGraphExportBytes
      : callsWithData > 0
        ? rawBaselineBytes / callsWithData
        : rawBaselineBytes
  const { baselineBytes, bounded: baselineExtrapolated } = boundDelegateBaseline({
    rawBytes: rawBaselineBytes,
    perReadBytes,
    episodes: commands.activeDays ?? 1,
  })
  const baselineTok = Math.ceil(baselineBytes / 4)
  const delegateEconomy: DelegateEconomy | undefined =
    commands.calls > 0 && baselineTok > 0
      ? {
          cmdCalls: commands.calls,
          cmdTok: commands.estimatedTokens,
          baselineTok,
          baselineBytes,
          delegateSaved: Math.max(0, baselineTok - commands.estimatedTokens),
          // Clamp at 0: once the baseline is bounded honestly, agf's compact output can exceed
          // it (no net delegate saving) — the real measured savings live in the lever ledger.
          savedPct:
            baselineTok > 0
              ? Math.max(0, Math.round(((baselineTok - commands.estimatedTokens) / baselineTok) * 100))
              : 0,
          avgTokPerCmd: Math.round(commands.estimatedTokens / commands.calls),
          baselineMethod: DELEGATE_BASELINE_METHOD,
          ...(baselineExtrapolated ? { baselineExtrapolated: true } : {}),
        }
      : undefined

  const totalSaved = (leverSavedTotal ?? 0) + totals.saved
  const consumed = totals.tokensIn + totals.tokensOut
  const measuredRate = totalSaved + consumed > 0 ? Math.round((totalSaved / (totalSaved + consumed)) * 100) : 0
  // The delegate figure is a bounded upper bound, not a measurement — let it set the headline
  // rate only when it shows a positive saving; otherwise fall back to the measured lever rate so
  // real savings are never masked by a delegate baseline that clamped to zero.
  const savingsRate = delegateEconomy && delegateEconomy.savedPct > 0 ? delegateEconomy.savedPct : measuredRate

  return {
    tasks,
    totals,
    pricing,
    backlogCount,
    projectedCost,
    commands,
    economyBlock,
    globalTotals,
    leverSavings,
    leverSavedTotal,
    delegateEconomy,
    totalSaved,
    savingsRate,
  }
}

export interface AssertMinResult {
  pass: boolean
  actual: number
  threshold: number
}

/** Pure assertion helper: returns pass/fail without side effects (no process.exit). */
export function assertMinSavings(actual: number, threshold: number): AssertMinResult {
  return { pass: actual >= threshold, actual, threshold }
}

/** Record the token/cost summary for a completed task into the cumulative savings ledger. */
export function recordTaskSavings(store: SqliteStore, nodeId: string, title: string): TaskSavings | null {
  const ledger = summarizeLedger(store.getDb())
  const taskData = ledger.byTask.find((t) => t.nodeId === nodeId)

  const pricing = getCustomPricing(store)

  const tokensIn = taskData?.tokensIn ?? 0
  const tokensOut = taskData?.tokensOut ?? 0
  const tokensCache = taskData?.cachedTokensIn ?? 0
  const cost =
    taskData?.costUsd ??
    (tokensIn > 0 || tokensOut > 0 ? calculateCostWithPricing(pricing, tokensIn, tokensOut, tokensCache).totalUsd : 0)

  const entry: TaskSavings = {
    nodeId,
    title: title.slice(0, 60),
    tokensIn,
    tokensOut,
    tokensCache,
    saved: tokensCache,
    cost,
  }

  const report = getCumulativeSavings(store)
  const existing = report.tasks.findIndex((t) => t.nodeId === nodeId)
  if (existing >= 0) {
    report.tasks[existing] = entry
  } else {
    report.tasks.push(entry)
  }

  store.setProjectSetting(SAVINGS_KEY, JSON.stringify(report.tasks))
  return entry
}

/** Reset the cumulative savings ledger to an empty array. */
export function resetSavings(store: SqliteStore): void {
  store.setProjectSetting(SAVINGS_KEY, '[]')
}

/** Format a SavingsReport into displayable terminal lines for the `agf savings` command. */
export function formatSavingsReport(report: SavingsReport): string[] {
  const usd = (n: number): string => `$${n.toFixed(4)}`
  const k = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n))

  const lines: string[] = ['╔ Token Economy — Cumulative Savings ╗', `║ ${formatPricing(report.pricing)}`]

  if (report.tasks.length === 0) {
    lines.push('║ (sem dados de task — popule o ledger com ECONOMY_* ligado)')
    pushLeverLines(report, lines, k)
    lines.push('╚══════════════════════════════════════╝')
    return lines
  }

  lines.push('╠══════════════════╤════════╤════════╤════════╤════════╤══════════╣')
  lines.push('║ Task             │ tok_in │ tok_out│ tok_cach│ saved  │ cost     ║')
  lines.push('╠══════════════════╪════════╪════════╪════════╪════════╪══════════╣')

  const recent = report.tasks.slice(-10)
  for (const t of recent) {
    const name = t.title.slice(0, 16).padEnd(16)
    lines.push(
      `║ ${name} │ ${k(t.tokensIn).padStart(6)} │ ${k(t.tokensOut).padStart(6)} │ ${k(t.tokensCache).padStart(6)} │ ${k(t.saved).padStart(6)} │ ${usd(t.cost).padStart(8)} ║`,
    )
  }

  lines.push('╠══════════════════╪════════╪════════╪════════╪════════╪══════════╣')
  const t = report.totals
  lines.push(
    `║ TOTALS (${report.tasks.length})      │ ${k(t.tokensIn).padStart(6)} │ ${k(t.tokensOut).padStart(6)} │ ${k(t.tokensCache).padStart(6)} │ ${k(t.saved).padStart(6)} │ ${usd(t.cost).padStart(8)} ║`,
  )

  if (report.backlogCount > 0 && report.projectedCost > 0) {
    lines.push(
      `║ Backlog: ${String(report.backlogCount).padStart(4)} tasks │ Proj: ~${usd(report.projectedCost)} até zerar`.padEnd(
        69,
      ) + '║',
    )
  }

  // Command ledger summary — universal I/O tracking
  if (report.commands && report.commands.calls > 0) {
    lines.push('╠══════════════════╧════════╧════════╧════════╧════════╧══════════╣')
    const cmd = report.commands
    lines.push(
      `║ COMMANDS (${String(cmd.calls).padStart(5)})       in:${k(cmd.inputBytes).padStart(5)}B  out:${k(cmd.outputBytes).padStart(5)}B  est:${k(cmd.estimatedTokens).padStart(5)}tok ║`,
    )
  }

  // CLI ECONOMY section — shown when agf is operated by an external agent (delegate mode)
  const de = report.delegateEconomy
  if (de && de.cmdCalls > 0) {
    lines.push('╠═ CLI ECONOMY (Delegate Mode) ════════════════════════════════════╣')
    lines.push('║ ⚡ Provider LLM = fallback; orquestrador = agente externo       ║')
    lines.push(
      `║ Comandos agf: ${String(de.cmdCalls).padStart(5)}  ·  avg: ${String(de.avgTokPerCmd).padStart(5)} tok/cmd              ║`,
    )
    lines.push(`║ Tokens emitidos (cmd_tok):    ${k(de.cmdTok).padStart(10)}                   ║`)
    if (de.baselineTok > 0) {
      const baselineLabel = de.baselineExtrapolated
        ? 'Baseline (est.) grafo×cmds:   '
        : 'Baseline sem agf (grafo×cmds):'
      lines.push(`║ ${baselineLabel}${k(de.baselineTok).padStart(10)}                   ║`)
      lines.push(
        `║ Economizados pelo CLI:        ${k(de.delegateSaved).padStart(10)}  (${String(de.savedPct).padStart(3)}%)          ║`,
      )
      if (de.baselineExtrapolated) {
        lines.push('║ (est.) = baseline projetado de amostra parcial de comandos     ║')
      }
    }
  }

  pushLeverLines(report, lines, k)

  lines.push('╚══════════════════╧════════╧════════╧════════╧════════╧══════════╝')
  return lines
}

/** Append a per-lever economy block (RAG in/out, compression, cache, reuse). */
function pushLeverLines(report: SavingsReport, lines: string[], k: (n: number) => string): void {
  const levers = report.leverSavings ?? []
  if (levers.length === 0) return
  lines.push('╠═ Economy levers (saved tokens) ═════════════════════════════════╣')
  for (const l of levers) {
    lines.push(
      `║ ${l.lever.padEnd(22)} ${k(l.totalSaved).padStart(7)} tok  (${String(l.count).padStart(4)} eventos)`.padEnd(
        66,
      ) + '║',
    )
  }
  lines.push(`║ ${'TOTAL levers'.padEnd(22)} ${k(report.leverSavedTotal ?? 0).padStart(7)} tok`.padEnd(66) + '║')
}

/** Savings% below this threshold triggers a `lowSavings` flag in by-command reports. */
export const LOW_SAVINGS_THRESHOLD_PCT = 20

export interface CommandSavingRow {
  command: string
  totalInputTokens: number
  totalCachedTokens: number
  /** Percentage of input tokens served from provider KV-cache (0–100). */
  savingPct: number
  calls: number
  /** True when savingPct < LOW_SAVINGS_THRESHOLD_PCT. */
  lowSavings: boolean
}

/**
 * Aggregate token savings (cached_input_tokens / input_tokens) per `caller`
 * from the llm_call_ledger.  Returns rows sorted by savingPct descending.
 */
export function getSavingsByCommand(db: Database.Database): CommandSavingRow[] {
  const rows = db
    .prepare(
      `SELECT caller AS command,
              COUNT(*) AS calls,
              SUM(input_tokens) AS totalInputTokens,
              SUM(COALESCE(cached_input_tokens, 0)) AS totalCachedTokens
       FROM llm_call_ledger
       WHERE caller IS NOT NULL
       GROUP BY caller
       ORDER BY totalCachedTokens DESC`,
    )
    .all() as { command: string; calls: number; totalInputTokens: number; totalCachedTokens: number }[]

  return rows.map((r) => {
    const savingPct = r.totalInputTokens > 0 ? (r.totalCachedTokens / r.totalInputTokens) * 100 : 0
    return { ...r, savingPct, lowSavings: savingPct < LOW_SAVINGS_THRESHOLD_PCT }
  })
}

/** A compact per-session savings receipt: what THIS sitting of work saved, per lever. */
export interface SessionSavingsReceipt {
  sessionId: string
  saved: number
  byLever: Record<string, number>
}

/**
 * Build the per-session receipt from the real `economy_lever_ledger` — the number an agent wants
 * when it finishes a build: "how many tokens did THIS session actually save, and via which levers?".
 * Reuses {@link summarizeByLever}(db, sessionId) and keeps only token-bearing levers (via
 * {@link isTokenLever}) so the receipt closes on the same number as the `agf savings` headline —
 * never an estimate, always summed ledger rows. Fail-safe: an unknown/empty session (or a missing
 * ledger table) returns `saved:0 / byLever:{}` rather than throwing.
 */
export function sessionSavingsReceipt(db: Database.Database, sessionId: string): SessionSavingsReceipt {
  const byLever: Record<string, number> = {}
  let saved = 0
  try {
    for (const row of summarizeByLever(db, sessionId)) {
      if (!isTokenLever(row.lever)) continue
      byLever[row.lever] = row.totalSaved
      saved += row.totalSaved
    }
  } catch {
    // Missing table / migration mid-flight → an empty receipt, never a crash on a read.
  }
  return { sessionId, saved, byLever }
}
