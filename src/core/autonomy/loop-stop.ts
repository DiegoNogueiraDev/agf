/*!
 * loop-stop — kills a background loop job by pid and updates the registry.
 *
 * WHY: `agf loop stop` terminates detached child processes and marks them
 * stopped in loop_jobs, even when the process is already dead (idempotent).
 *
 * Composes with: loop-registry.ts (markStopped/listLoops/getLoop), loop-cmd.ts.
 */

import type Database from 'better-sqlite3'
import { getLoop, listLoops, markStopped } from './loop-registry.js'

export interface StopOpts {
  /** Injected killer for testability; defaults to process.kill(pid, 'SIGTERM'). */
  killer?: (pid: number) => void
}

export type StopResult = { ok: true; id: string } | { ok: false; code: 'NOT_FOUND'; id: string }

export function stopLoop(db: Database.Database, id: string, opts: StopOpts = {}): StopResult {
  const job = getLoop(db, id)
  if (!job) return { ok: false, code: 'NOT_FOUND', id }

  const killer = opts.killer ?? ((pid) => process.kill(pid, 'SIGTERM'))
  // pid<=0 has special kill() semantics (0 = whole process group, negative =
  // process group by id) — never a valid single-process target here. Treat
  // it as "nothing to kill" rather than risk signaling unrelated processes.
  if (job.pid > 0) {
    try {
      killer(job.pid)
    } catch {
      // Process already dead — tolerate ESRCH and similar
    }
  }
  markStopped(db, id)
  return { ok: true, id }
}

export interface StopAllResult {
  stopped: number
  ids: string[]
}

export function stopAllLoops(db: Database.Database, opts: StopOpts = {}): StopAllResult {
  const running = listLoops(db, { status: 'running' })
  const ids: string[] = []
  for (const job of running) {
    const result = stopLoop(db, job.id, opts)
    if (result.ok) ids.push(job.id)
  }
  return { stopped: ids.length, ids }
}
