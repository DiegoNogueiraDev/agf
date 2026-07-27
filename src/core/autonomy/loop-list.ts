/*!
 * loop-list — envelope helpers for `agf loop list` and `agf loop status`.
 *
 * WHY: Thin adapter that wraps loop-registry reads in the ok/err envelope
 * shape expected by createCliOutput, keeping CLI commands thin.
 *
 * Composes with: loop-registry.ts, loop-cmd.ts.
 */

import type Database from 'better-sqlite3'
import { listLoops, getLoop, type LoopJob } from './loop-registry.js'

export type ListEnvelope = { ok: true; data: LoopJob[] }

export type StatusEnvelope = { ok: true; data: LoopJob } | { ok: false; code: 'NOT_FOUND' }

export function listLoopsEnvelope(db: Database.Database, status?: 'running' | 'stopped'): ListEnvelope {
  const jobs = listLoops(db, status ? { status } : undefined)
  return { ok: true, data: jobs }
}

export function loopStatusEnvelope(db: Database.Database, id: string): StatusEnvelope {
  const job = getLoop(db, id)
  if (!job) return { ok: false, code: 'NOT_FOUND' }
  return { ok: true, data: job }
}
