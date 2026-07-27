/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * What a successful retrieval actually saves.
 *
 * The old answer was a constant: `GENERATION_OVERHEAD_TOKENS = 60`, chosen in a comment that said
 * "~60 tokens of reasoning/prose is typical". So `rag_in_reuse` reported sixty tokens times the
 * number of calls, forever. That is a multiplication, not a measurement, and it cannot be wrong —
 * which is the same as saying it cannot be evidence.
 *
 * WHY the fallback is the baseline: the system already names the counterfactual. Below its
 * confidence gate, retrieval returns `agf --help`, and `_rag-protocol.md` tells the agent to read
 * `agf help` rather than guess a flag. Whatever a successful retrieval saved, it saved *that* —
 * and unlike a chosen constant, that is a text which exists and can be counted.
 *
 * WHY from the ledger: `command_invocations` has been counting it all along. Twenty-two runs of
 * `agf help`, 457 tokens each, min equal to max because the output is deterministic. Reading the
 * number from the machine's own history makes it falsifiable — run `agf help | wc -c` and check.
 *
 * WHY the median: one freak invocation (a `--help` piped through a formatter, a truncated pipe)
 * would drag a mean off a cliff. The median stays where the data is.
 *
 * WHY it is a lower bound: `agf help` lists the curated commands, not all 393. An agent that does
 * not find its command there reads more, never less. Understating a saving is the honest direction.
 *
 * Contract: returns null when nothing was measured — no data, no claim. The caller then falls back
 * to the structural estimate and labels it as such. Never throws: this is telemetry.
 */

import type Database from 'better-sqlite3'

/** The measured cost of the path a successful retrieval avoided. */
export interface FallbackBaseline {
  /** Median tokens emitted by `agf help` on this machine. */
  tokens: number
  /** How many invocations the median was taken over. Evidence has a sample size. */
  samples: number
}

/** The command the engine hands back when it refuses — and the one the protocol tells you to read. */
const FALLBACK_COMMAND = 'help'

/** Median of a non-empty ascending array; the lower of the two middles when even. */
function median(ascending: readonly number[]): number {
  const middle = Math.floor((ascending.length - 1) / 2)
  return ascending[middle] ?? 0
}

/**
 * The tokens `agf help` really emitted on this machine, or null when it never ran.
 *
 * Invocations that emitted nothing are excluded: a zero is a command that failed before printing,
 * not a help page that cost nothing to read.
 */
export function measuredFallbackTokens(db: Database.Database): FallbackBaseline | null {
  try {
    const rows = db
      .prepare(
        `SELECT estimated_tokens AS tokens FROM command_invocations
         WHERE command = ? AND estimated_tokens > 0 ORDER BY estimated_tokens ASC`,
      )
      .all(FALLBACK_COMMAND) as Array<{ tokens: number }>

    if (rows.length === 0) return null
    return { tokens: median(rows.map((r) => r.tokens)), samples: rows.length }
  } catch {
    // No ledger table, a locked database, a migration mid-flight: no claim.
    return null
  }
}
