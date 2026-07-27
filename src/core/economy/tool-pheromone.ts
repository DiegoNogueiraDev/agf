/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * ACO tool routing — pheromone on (intent→tool) edges.
 * Reuses pheromone_trails table (keyed by "intent:tool") from pheromone-store.
 * ACS selection: q < q0=0.70 → exploit best; q ≥ q0 → explore probabilistically.
 * JIT injection: topToolsForIntent(db, intent, 3) returns top-N for prompt injection.
 *
 * WHY: reduces tool catalog injected into context by 66% (top-3 vs full catalog)
 * based on learned (intent→tool) success trails — economy lever.
 * Composing: pheromone-store (deposit/query) + economy orchestrator (ACS selection).
 */

import type Database from 'better-sqlite3'
import { depositPheromone } from './pheromone-store.js'

const PROJECT_ID = 'tool-routing'
/** ACS exploitation threshold. Below this, pick the best tool; otherwise explore. */
const Q0 = 0.7

export interface DepositToolPheromoneOpts {
  intent: string
  tool: string
  amount?: number
  nowMs?: number
}

export interface ToolPheromoneEntry {
  tool: string
  amount: number
  ts: number
}

export interface SelectToolOpts {
  /** Random value in [0,1). Injected for deterministic tests. Default: Math.random(). */
  q?: number
}

/** Edge key for the pheromone_trails table. */
function edgeKey(intent: string, tool: string): string {
  return `${intent}:${tool}`
}

/**
 * Deposit pheromone on the (intent→tool) edge.
 * Accumulates: repeated deposits strengthen the trail.
 */
export function depositToolPheromone(db: Database.Database, opts: DepositToolPheromoneOpts): void {
  depositPheromone(db, PROJECT_ID, edgeKey(opts.intent, opts.tool), opts.amount ?? 1.0, opts.nowMs)
}

/**
 * Return the top-N tools for an intent, sorted by pheromone strength descending.
 * Used for JIT tool injection into the agent prompt.
 */
export function topToolsForIntent(db: Database.Database, intent: string, limit: number): ToolPheromoneEntry[] {
  const prefix = `${intent}:`
  const rows = db
    .prepare(
      `SELECT key, amount, ts FROM pheromone_trails
       WHERE project_id = ? AND key LIKE ?
       ORDER BY amount DESC
       LIMIT ?`,
    )
    .all(PROJECT_ID, `${prefix}%`, limit) as Array<{ key: string; amount: number; ts: number }>

  return rows.map((r) => ({
    tool: r.key.slice(prefix.length),
    amount: r.amount,
    ts: r.ts,
  }))
}

/**
 * ACS selection: given candidate tool entries and a random draw q:
 * - q < Q0 (0.70): exploit — return the highest-pheromone tool
 * - q ≥ Q0: explore — return a random tool (weighted by amount)
 * Returns null when candidates is empty.
 */
export function selectTool(candidates: ToolPheromoneEntry[], opts: SelectToolOpts = {}): string | null {
  if (candidates.length === 0) return null
  const q = opts.q ?? Math.random()
  if (q < Q0) {
    // Exploit: best tool
    return candidates[0].tool
  }
  // Explore: weighted random selection
  const total = candidates.reduce((s, c) => s + c.amount, 0)
  let pick = Math.random() * total
  for (const c of candidates) {
    pick -= c.amount
    if (pick <= 0) return c.tool
  }
  return candidates[candidates.length - 1].tool
}
