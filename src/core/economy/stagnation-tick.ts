/*!
 * stagnation-tick — adapter that gates stagnationControl behind the aco_autotune
 * lever and records a ledger row when it fires.
 *
 * WHY: stagnationControl (mmas-pheromone.ts) is already implemented but called
 * unconditionally in done-cmd. This adapter adds the opt-in lever gate and the
 * observability ledger row — keeping the core MMAS function pure and the done-cmd
 * change additive/non-breaking. Default OFF = byte-identical to the prior state.
 *
 * Composes with: mmas-pheromone.ts (controller), economy-lever-ledger.ts
 *   (observability), done-cmd.ts (call site).
 */

import type Database from 'better-sqlite3'
import { stagnationControl, type StagnationDecision } from './mmas-pheromone.js'
import { recordLeverEvent } from './economy-lever-ledger.js'

export interface StagnationTickOpts {
  /**
   * Whether the aco_autotune lever is enabled.
   * When true, records an economy_lever_ledger row.
   * Stagnation control always runs regardless of this flag (MMAS default-ON).
   */
  leverEnabled: boolean
  /** Session ID for ledger attribution (optional). */
  sessionId?: string
  /** Node ID being completed (for attribution). */
  nodeId?: string
  /** Override nowMs for deterministic tests. */
  nowMs?: number
}

/**
 * Runs a stagnation control tick unconditionally (MMAS bounds + reset are always on).
 * Records an economy_lever_ledger row only when the aco_autotune lever is enabled.
 *
 * WHY default-ON: stagnation recovery is a safety mechanism (not a cost lever) — a
 * colony that converges prematurely produces worse task routing. The lever flag now
 * controls only whether economy events are counted, not whether the control fires.
 */
export function runStagnationTick(
  db: Database.Database,
  projectId: string,
  opts: StagnationTickOpts,
): StagnationDecision | null {
  const decision = stagnationControl(db, projectId, opts.nowMs !== undefined ? { nowMs: opts.nowMs } : {})

  if (opts.leverEnabled) {
    recordLeverEvent(db, {
      sessionId: opts.sessionId ?? 'unknown',
      nodeId: opts.nodeId,
      lever: 'aco_autotune',
      tokensBefore: 0,
      tokensAfter: 0,
      saved: 0,
      accepted: true,
      gateOutcome: 'passthrough',
      score: decision.hNorm,
    })
  }

  return decision
}
