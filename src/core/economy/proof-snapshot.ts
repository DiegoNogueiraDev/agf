/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 */

/**
 * proof-snapshot — the canonical `TokenEconomyProofSnapshot` shape (contract
 * node_e5ca2d78ae43) shared by CLI, TUI, and Web so the three surfaces never
 * diverge. Pure: store in -> snapshot out, zero filesystem I/O.
 *
 * Composes EXISTING aggregators, no new SQL beyond `summarizeScaffoldRecovery`
 * (economy-lever-ledger.ts, a small addition to that module's own concern):
 *   getCumulativeSavings  (economy/savings-tracker.ts)      -> totals + commands
 *   getSavingsByCommand   (economy/savings-tracker.ts)      -> byCommand
 *   summarizeByLever      (economy/economy-lever-ledger.ts) -> levers
 *   summarizeScaffoldRecovery (economy/economy-lever-ledger.ts) -> scaffoldReuse
 *
 * Distinct from web/economy-snapshot.ts's `EconomySnapshot` (a richer,
 * web-dashboard-specific shape with cache/delegate/commands views) — this is
 * the leaner, cross-surface "proof" shape a CLI/TUI command can render too.
 */
import { getCumulativeSavings, getSavingsByCommand } from './savings-tracker.js'
import { summarizeByLever, summarizeScaffoldRecovery, type LeverSummary } from './economy-lever-ledger.js'
import type { SqliteStore } from '../store/sqlite-store.js'

export interface ProofTotals {
  totalCommands: number
  inputTokens: number
  outputTokens: number
  tokensSaved: number
  /** Percent, 0-100. */
  savingsRate: number
  totalExecMs: number
  avgExecMs: number
  /** True when the delegate-economy baseline was extrapolated rather than measured. */
  baselineExtrapolated: boolean
}

export interface ProofCommandRow {
  command: string
  count: number
  savedTokens: number
  /** Percent, 0-100. */
  savingsRate: number
  avgMs: number
  lowSavings: boolean
  impact: 'low' | 'high'
}

export interface ProofScaffoldReuse {
  recovered: number
  generated: number
  tokensSaved: number
  savingsRatio: number
}

export interface TokenEconomyProofSnapshot {
  totals: ProofTotals
  byCommand: ProofCommandRow[]
  levers: LeverSummary[]
  scaffoldReuse: ProofScaffoldReuse
}

/** Build the cross-surface token-economy proof snapshot from a store (zero new SQL, all existing aggregators). */
export function buildProofSnapshot(store: SqliteStore): TokenEconomyProofSnapshot {
  const db = store.getDb()
  const savings = getCumulativeSavings(store)
  const commandRows = getSavingsByCommand(db)
  const levers = summarizeByLever(db)
  const scaffoldReuse = summarizeScaffoldRecovery(db)

  const cmd = savings.commands
  const totals: ProofTotals = {
    totalCommands: cmd?.calls ?? 0,
    inputTokens: savings.totals.tokensIn,
    outputTokens: savings.totals.tokensOut,
    tokensSaved: savings.totalSaved,
    savingsRate: savings.savingsRate,
    totalExecMs: Math.round((cmd?.avgDurationMs ?? 0) * (cmd?.calls ?? 0)),
    avgExecMs: cmd?.avgDurationMs ?? 0,
    baselineExtrapolated: savings.delegateEconomy?.baselineExtrapolated ?? false,
  }

  const byCommand: ProofCommandRow[] = commandRows.map((r) => ({
    command: r.command,
    count: r.calls,
    savedTokens: r.totalCachedTokens,
    savingsRate: r.savingPct,
    avgMs: 0, // llm_call_ledger (this row's source) doesn't track per-call duration.
    lowSavings: r.lowSavings,
    impact: r.lowSavings ? 'low' : 'high',
  }))

  return { totals, byCommand, levers, scaffoldReuse }
}

/** Render the proof snapshot as a box-drawing text block for TUI slash-commands (e.g. /savings). */
export function formatProofSnapshot(snap: TokenEconomyProofSnapshot): string[] {
  const lines: string[] = ['╔ Token Economy — Proof Surface ╗']

  if (snap.totals.totalCommands === 0 && snap.byCommand.length === 0 && snap.scaffoldReuse.recovered === 0) {
    lines.push('║ (sem dados — nenhum comando/lever registrado ainda)')
    lines.push('╚════════════════════════════════════╝')
    return lines
  }

  lines.push(`║ totalCommands=${snap.totals.totalCommands} savingsRate=${snap.totals.savingsRate.toFixed(1)}%`)

  if (snap.byCommand.length > 0) {
    lines.push('║ by-command:')
    for (const row of snap.byCommand.slice(0, 10)) {
      lines.push(`║   ${row.command}: count=${row.count} savedTokens=${row.savedTokens} impact=${row.impact}`)
    }
  }

  lines.push(
    `║ scaffold reuse: recovered=${snap.scaffoldReuse.recovered} generated=${snap.scaffoldReuse.generated} tokensSaved=${snap.scaffoldReuse.tokensSaved}`,
  )
  lines.push('╚════════════════════════════════════╝')
  return lines
}
