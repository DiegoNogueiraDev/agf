/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Which task earned the tokens a lever saved.
 *
 * WHY it exists: `economy_lever_ledger` held 167 rows with `node_id` NULL on every one. The
 * total was real — 6,991 tokens, measured against baselines you can argue with — but it belonged
 * to nobody, so it could not be audited, and a benchmark run was indistinguishable from a day of
 * work. Sixty-three percent of that total turned out to be one afternoon of probing the retriever.
 *
 * WHY the WIP node: the graph already answers the question. WIP=1 is the project's own invariant,
 * so at most one node is `in_progress` at any moment. A lever that fires while a task is being
 * worked belongs to that task; one that fires with nothing in progress belongs to nothing — and
 * that absence is the signal, because that is precisely what a benchmark looks like.
 *
 * WHY it abstains: the invariant is enforced, not guaranteed — `--force` and a crashed loop both
 * break it. Two candidates means the ledger cannot know which earned the tokens, and a ledger that
 * guesses is worse than one that admits it does not know.
 *
 * Contract: `currentTaskId(db)` returns a node id or null, and never throws. Attribution is
 * telemetry; it must not take a command down with it.
 *
 * Composes with: economy-lever-ledger.ts (writes the row), rag-in/economy.ts and
 * rag-out/economy.ts (`toLeverEvent(e, sessionId, nodeId?)` — the parameter was there from the
 * start; nobody passed it).
 */

import type Database from 'better-sqlite3'
import { NON_TOKEN_LEVERS } from './lever-units.js'

/**
 * The task currently being worked, or null when there is none — or when there is more than one,
 * because then no honest answer exists.
 */
export function currentTaskId(db: Database.Database): string | null {
  try {
    const rows = db
      .prepare(`SELECT id FROM nodes WHERE status = 'in_progress' AND archived = 0 LIMIT 2`)
      .all() as Array<{ id: string }>

    return rows.length === 1 ? (rows[0]?.id ?? null) : null
  } catch {
    // No `nodes` table, a locked database, a migration mid-flight: telemetry stays quiet.
    return null
  }
}

/**
 * The levers to leave out. Excluding `scaffold_recovery` from the headline and leaving it in the
 * breakdown would be the same failure one layer down: a total that adds up and a split beneath it
 * that does not.
 */
function excludedLeverList(): string {
  return [...NON_TOKEN_LEVERS].map((lever) => `'${lever}'`).join(', ')
}

/** Tokens a single task earned across every lever that fired while it was in progress. */
export interface NodeSavings {
  nodeId: string
  events: number
  saved: number
}

/** The ledger split by whether anyone owns the saving. */
export interface AttributionSummary {
  attributed: { events: number; saved: number }
  /** Levers that fired with no task in progress: benchmarks, probes, one-off shell calls. */
  unattributed: { events: number; saved: number }
  byNode: NodeSavings[]
}

const EMPTY: AttributionSummary = {
  attributed: { events: 0, saved: 0 },
  unattributed: { events: 0, saved: 0 },
  byNode: [],
}

/**
 * Split the lever ledger by owner. `agf savings` reported 6,991 tokens and could not say that
 * 63% of them came from an afternoon spent probing the retriever — a headline nobody could audit.
 * The split is the audit: work that a task earned, and work that nothing did.
 */
export function summarizeAttribution(db: Database.Database): AttributionSummary {
  try {
    const excluded = excludedLeverList()
    const totals = db
      .prepare(
        `SELECT node_id IS NOT NULL AS owned, COUNT(*) AS events, COALESCE(SUM(saved), 0) AS saved
         FROM economy_lever_ledger WHERE lever NOT IN (${excluded}) GROUP BY owned`,
      )
      .all() as Array<{ owned: number; events: number; saved: number }>

    const byNode = db
      .prepare(
        `SELECT node_id AS nodeId, COUNT(*) AS events, COALESCE(SUM(saved), 0) AS saved
         FROM economy_lever_ledger WHERE node_id IS NOT NULL AND lever NOT IN (${excluded})
         GROUP BY node_id ORDER BY saved DESC, node_id ASC`,
      )
      .all() as NodeSavings[]

    const bucket = (owned: number): { events: number; saved: number } => {
      const row = totals.find((t) => t.owned === owned)
      return { events: row?.events ?? 0, saved: row?.saved ?? 0 }
    }

    return { attributed: bucket(1), unattributed: bucket(0), byNode }
  } catch {
    return EMPTY
  }
}

/** Tokens one sitting of work earned. */
export interface SessionSavings {
  sessionId: string
  events: number
  saved: number
}

/**
 * What each sitting of work saved.
 *
 * The question an agent asks when it finishes, and one the ledger could not answer while
 * `session_id` was the constant `'cli'`: grouping by a value that never varies returns one bucket,
 * which is the same as not grouping. See `core/session/session-id.ts`.
 */
export function savingsBySession(db: Database.Database): SessionSavings[] {
  try {
    return db
      .prepare(
        `SELECT session_id AS sessionId, COUNT(*) AS events, COALESCE(SUM(saved), 0) AS saved
         FROM economy_lever_ledger WHERE lever NOT IN (${excludedLeverList()})
         GROUP BY session_id ORDER BY saved DESC, sessionId ASC`,
      )
      .all() as SessionSavings[]
  } catch {
    return []
  }
}

/** Tokens a single counterfactual accounts for. */
export interface BaselineShare {
  baselineMethod: string
  events: number
  saved: number
}

/**
 * How much of the total each baseline is responsible for.
 *
 * `agf savings` used to stamp `baselineMethod: 'structural'` on the whole envelope. That was true
 * while every row was computed against a chosen constant, and stopped being true the moment one row
 * was measured. A flat label over a mixed ledger is the same failure as no label at all.
 *
 * Rows written before the column existed carry NULL and are read as `structural` — the constant
 * they in fact used.
 */
export function baselineMethodMix(db: Database.Database): BaselineShare[] {
  try {
    return db
      .prepare(
        `SELECT COALESCE(baseline_method, 'structural') AS baselineMethod,
                COUNT(*) AS events, COALESCE(SUM(saved), 0) AS saved
         FROM economy_lever_ledger WHERE lever NOT IN (${excludedLeverList()})
         GROUP BY baselineMethod ORDER BY saved DESC, baselineMethod ASC`,
      )
      .all() as BaselineShare[]
  } catch {
    return []
  }
}
