/*!
 * compress-run-ledger — records compress-run token savings to economy_lever_ledger.
 *
 * WHY: agf compress run already computes saved-token deltas but never wrote them
 * to the lever ledger. This bridges the gap so agf savings + agf metrics
 * reflect compression economy per-session.
 *
 * Composes with: compress-cmd.ts (caller), economy-lever-ledger.ts (writer),
 * savings-tracker.ts (reader surfacing cumulative totals).
 */

import type Database from 'better-sqlite3'
import { recordLeverEvent } from './economy-lever-ledger.js'

export interface CompressRunSavingsInput {
  tokensBefore: number
  tokensAfter: number
  saved: number
  sessionId?: string
  nodeId?: string
}

/**
 * Records a compress-run savings event in economy_lever_ledger.
 * Graceful no-op when `db` is null (no project store present).
 */
export function recordCompressRunSavings(db: Database.Database | null, input: CompressRunSavingsInput): void {
  if (!db) return
  recordLeverEvent(db, {
    surface: 'hook',
    sessionId: input.sessionId ?? 'compress-run',
    nodeId: input.nodeId,
    lever: 'exec_compress',
    tokensBefore: input.tokensBefore,
    tokensAfter: input.tokensAfter,
    saved: input.saved,
    accepted: true,
    gateOutcome: 'accepted',
  })
}
