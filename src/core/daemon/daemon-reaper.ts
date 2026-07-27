/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Reaper for stale and orphaned mcp-graph daemons.
 *
 * Scans `~/.mcp-graph/<hash>/` state directories and classifies each:
 *
 *   - daemon alive, workspace still exists  → kept (idle timeout owns it)
 *   - daemon alive, workspace gone          → killed (SIGTERM)
 *   - no live daemon (stale/missing pidfile)→ state dir removed
 *
 * This is the cleanup half of the daemon-leak fix. The idle timeout
 * ({@link ../daemon/idle-config}) prevents *new* leaks; the reaper removes
 * daemons leaked before the fix and the empty state dirs they left behind.
 *
 * Runs both on demand (`mcp-graph daemon prune`) and passively at the start of
 * every daemon (so the population self-heals without manual intervention).
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkLock } from './daemon-lockfile.js'
import { readDaemonMeta } from './daemon-meta.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'daemon-reaper' })

/** Default root of per-workspace daemon state directories. */
export function defaultDaemonRoot(home: string = os.homedir()): string {
  return path.join(home, '.mcp-graph')
}

/**
 * Daemon state dirs are named by a 10-hex-char workspace hash (see
 * `daemon-paths.ts` HASH_LENGTH). Anything else under `~/.mcp-graph` — `logs`,
 * `demos`, etc. — is not a daemon dir and must never be reaped.
 */
const STATE_DIR_NAME_RE = /^[0-9a-f]{10}$/

export type ReapOutcome = 'killed' | 'removed' | 'kept'

export interface ReapAction {
  /** Absolute path of the state directory. */
  stateDir: string
  /** Daemon PID, when a pidfile was present. */
  pid?: number
  /** Workspace the daemon served, when metadata was present. */
  workspacePath?: string
  outcome: ReapOutcome
  /** Human-readable reason for the classification. */
  reason: string
}

export interface ReapReport {
  /** Number of state directories inspected. */
  scanned: number
  actions: ReapAction[]
  killed: number
  removed: number
  kept: number
}

export interface ReapOptions {
  /** Root to scan. Defaults to `~/.mcp-graph`. */
  rootDir?: string
  /** When true, classify and report but do not kill or delete anything. */
  dryRun?: boolean
  /**
   * Signal sender — injectable for tests. Default sends SIGTERM, which the
   * daemon traps for a graceful shutdown (WAL flush + lock release).
   */
  killFn?: (pid: number) => void
  /** State dir to never touch — the caller's own daemon dir. */
  protectStateDir?: string
}

function defaultKill(pid: number): void {
  process.kill(pid, 'SIGTERM')
}

/**
 * Scan the daemon root and reap stale / orphaned daemons.
 *
 * Pure except for the side effects it is asked to perform (kill, rmdir), both
 * suppressible via `dryRun`. Never throws — a single unreadable directory is
 * skipped, not fatal, so this is safe to call on the daemon hot path.
 */
export function reapDaemons(options: ReapOptions = {}): ReapReport {
  const rootDir = options.rootDir ?? defaultDaemonRoot()
  const kill = options.killFn ?? defaultKill
  const dryRun = options.dryRun ?? false

  const report: ReapReport = { scanned: 0, actions: [], killed: 0, removed: 0, kept: 0 }

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true })
  } catch {
    // Root does not exist yet — nothing to reap.
    return report
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!STATE_DIR_NAME_RE.test(entry.name)) continue
    const stateDir = path.join(rootDir, entry.name)
    report.scanned++

    if (options.protectStateDir && path.resolve(stateDir) === path.resolve(options.protectStateDir)) {
      report.actions.push({ stateDir, outcome: 'kept', reason: "protected (caller's own daemon)" })
      report.kept++
      continue
    }

    const lock = checkLock(path.join(stateDir, 'daemon.pid'))
    const meta = readDaemonMeta(stateDir)
    const workspacePath = meta?.workspacePath

    if (lock.alive && lock.pid !== undefined) {
      const workspaceGone = workspacePath !== undefined && !fs.existsSync(workspacePath)
      if (workspaceGone) {
        if (!dryRun) {
          try {
            kill(lock.pid)
          } catch (err) {
            log.debug('intentional-swallow', {
              error: String(err),
              reason: 'process vanished between liveness probe and signal — treat as already reaped',
            })
          }
        }
        report.actions.push({
          stateDir,
          pid: lock.pid,
          workspacePath,
          outcome: 'killed',
          reason: 'alive, workspace no longer exists',
        })
        report.killed++
      } else {
        report.actions.push({
          stateDir,
          pid: lock.pid,
          workspacePath,
          outcome: 'kept',
          reason: workspacePath ? 'alive, workspace present' : 'alive, unidentified — left for idle timeout',
        })
        report.kept++
      }
      continue
    }

    // No live daemon — the state dir is leftover clutter (stale pidfile, just
    // a log file, etc.). Safe to remove.
    if (!dryRun) {
      try {
        fs.rmSync(stateDir, { recursive: true, force: true })
      } catch (err) {
        log.debug('intentional-swallow', {
          error: String(err),
          reason: 'state dir removal hit a permission error or race — next reaper run retries',
        })
      }
    }
    report.actions.push({
      stateDir,
      pid: lock.pid,
      workspacePath,
      outcome: 'removed',
      reason: lock.stale ? 'stale pidfile — daemon dead' : 'no live daemon',
    })
    report.removed++
  }

  return report
}
