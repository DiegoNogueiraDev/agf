/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Pidfile-based liveness check for the mcp-graph daemon.
 *
 * We use the classic `kill(pid, 0)` probe: signal 0 performs the error checks
 * for sending a signal but delivers nothing, so it is a cheap "is this PID
 * alive?" test supported on POSIX and Windows (Node maps it internally).
 *
 * Strategy:
 *   - acquireLock: read existing pidfile → alive? refuse. stale? replace.
 *     Write our PID with `wx` (exclusive create) to catch races; if that
 *     fails we re-check once to distinguish "another daemon won the race"
 *     from "leftover stale file we must overwrite".
 *   - releaseLock: unlink, tolerate ENOENT.
 */

import fs from 'node:fs'
import { McpGraphError } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'daemon-lockfile' })

export interface LockState {
  /** True iff a process with the recorded PID is currently alive. */
  alive: boolean
  /** PID read from the file, if any. Undefined when the file is missing. */
  pid?: number
  /**
   * True when a pidfile exists but the process it names is gone — safe to
   * reclaim.
   */
  stale?: boolean
}

/** Inspect the pidfile without mutating anything. */
export function checkLock(pidFile: string): LockState {
  let raw: string
  try {
    raw = fs.readFileSync(pidFile, 'utf8')
  } catch {
    return { alive: false }
  }

  const pid = parseInt(raw.trim(), 10)
  if (!Number.isFinite(pid) || pid <= 0) {
    return { alive: false, stale: true }
  }

  try {
    process.kill(pid, 0)
    return { alive: true, pid }
  } catch {
    return { alive: false, pid, stale: true }
  }
}

/**
 * Acquire the lock for the current process. Throws `McpGraphError` if a live
 * daemon already holds it. Stale pidfiles are reclaimed automatically.
 */
export function acquireLock(pidFile: string): void {
  const state = checkLock(pidFile)
  if (state.alive) {
    throw new McpGraphError(`Daemon already running (pid=${state.pid})`)
  }
  if (state.stale) {
    try {
      fs.unlinkSync(pidFile)
    } catch (err) {
      log.debug('intentional-swallow', { error: String(err), reason: 'may have vanished between check and unlink' })
    }
  }

  try {
    fs.writeFileSync(pidFile, String(process.pid), { flag: 'wx' })
    return
  } catch {
    // Race: another daemon may have acquired between the check and write.
    const recheck = checkLock(pidFile)
    if (recheck.alive) {
      throw new McpGraphError(`Daemon already running (pid=${recheck.pid})`)
    }
    // Leftover from a crash in the same millisecond — force-overwrite.
    fs.writeFileSync(pidFile, String(process.pid))
  }
}

/** Remove the pidfile. Tolerates already-missing files. */
export function releaseLock(pidFile: string): void {
  try {
    fs.unlinkSync(pidFile)
  } catch (err) {
    log.debug('intentional-swallow', {
      error: String(err),
      reason: 'release lock no-op — tolerate already-missing files',
    })
  }
}
