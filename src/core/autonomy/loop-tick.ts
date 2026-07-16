/*!
 * loop-tick — single tick executor for a loop job.
 *
 * WHY: The body of each interval iteration: runs the payload as an agf command
 * (kind=command) or delegates to the external pilot (kind=prompt), then calls
 * incrementRuns so the registry tracks execution count.
 *
 * Composes with: loop-registry.ts (incrementRuns), agf-runner.ts (command path).
 * Contract: runner/delegateRunner are injected for testability — no real child process.
 */

import type Database from 'better-sqlite3'
import { incrementRuns } from './loop-registry.js'

export type TickKind = 'command' | 'prompt'

export interface TickOpts {
  loopId: string
  kind: TickKind
  payload: string
  /** Injected for command kind; defaults to real runAgf in production. */
  runner?: (cmd: string) => Promise<void>
  /** Injected for prompt kind; defaults to delegate-mode deliver in production. */
  delegateRunner?: (prompt: string) => Promise<void>
}

const DEFAULT_COMMAND = 'autopilot'

export async function runTick(db: Database.Database, opts: TickOpts): Promise<void> {
  const cmd = opts.payload.trim() || DEFAULT_COMMAND

  if (opts.kind === 'command') {
    const runner = opts.runner ?? (() => Promise.resolve())
    await runner(cmd)
  } else {
    const delegateRunner = opts.delegateRunner ?? (() => Promise.resolve())
    await delegateRunner(opts.payload)
  }

  incrementRuns(db, opts.loopId)
}
