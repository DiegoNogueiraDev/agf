/*!
 * loop-start — registers and detaches a background loop job.
 *
 * WHY: `agf loop start` must not block the parent process. This module
 * wraps the spawner (injected for tests) and wires the registry entry.
 *
 * Composes with: loop-registry.ts (persistence), interval-loop.ts (parseDuration),
 *                loop-cmd.ts (CLI surface).
 */

import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { parseDuration } from './interval-loop.js'
import { registerLoop } from './loop-registry.js'

export interface FakeProcess {
  pid: number
  unref: () => void
}

export type Spawner = (detached: boolean, payload: string, intervalSecs: number) => FakeProcess

export interface StartLoopOpts {
  payload: string
  every: string
  spawner: (detached: boolean, loopId: string) => FakeProcess
  maxRuns?: number
}

export interface StartLoopResult {
  loopId: string
  pid: number
  intervalSecs: number
}

/**
 * Parse duration, register the loop, spawn detached child (unref'd), return loopId.
 * Throws InvalidArgumentError when `every` is unparseable (no registry mutation).
 */
export function startLoop(db: Database.Database, opts: StartLoopOpts): StartLoopResult {
  const intervalMs = parseDuration(opts.every) // throws if invalid
  const intervalSecs = Math.round(intervalMs / 1000)

  // The id is generated up front so the spawned child can be told its own
  // registry row (via --loop-id) and report ticks back — see loop-tick.ts.
  const loopId = randomUUID()

  // Spawn BEFORE registering: registerLoop must persist the real pid, never
  // the placeholder 0 — a stop() on pid 0 sends SIGTERM to the whole process
  // group (kill(0, sig) semantics), not just the intended child.
  const child = opts.spawner(true, loopId)
  child.unref()

  registerLoop(db, { id: loopId, prompt: opts.payload, intervalSecs, pid: child.pid })

  return { loopId, pid: child.pid, intervalSecs }
}
