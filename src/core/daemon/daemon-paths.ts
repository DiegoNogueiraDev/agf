/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Cross-platform paths for the per-workspace mcp-graph daemon.
 *
 * Each workspace gets its own state directory keyed by a short hash of its
 * absolute path — workspaces stay isolated from each other, and paths stay
 * short enough to fit inside the Unix `sockaddr_un.sun_path` limit (104 bytes
 * on macOS/BSD, 108 on Linux).
 *
 * Layout:
 *   $HOME/.mcp-graph/<hash>/
 *     daemon.sock   (Unix socket — macOS/Linux)
 *     daemon.pid    (liveness pidfile)
 *     daemon.log    (stderr tail for debugging)
 *
 * On Windows the socket becomes a named pipe at `\\.\pipe\mcp-graph-<hash>`
 * (pipes have no filesystem counterpart, so only pidFile/logFile live in
 * the state dir).
 */

import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import fs from 'node:fs'

const STATE_DIR_NAME = '.mcp-graph'
const HASH_LENGTH = 10

export interface DaemonPaths {
  /** Hash of the workspace path — stable across invocations. */
  workspaceHash: string
  /** Per-workspace directory under $HOME/.mcp-graph. */
  stateDir: string
  /** Socket path (Unix socket on macOS/Linux, named pipe on Windows). */
  socketPath: string
  /** Pidfile used for liveness / stale-daemon detection. */
  pidFile: string
  /** Daemon stderr log (append-only). */
  logFile: string
}

/**
 * Compute the daemon paths for a workspace.
 *
 * The workspace path is canonicalized with `realpath` when it exists on disk,
 * so two callers referring to the same directory via different symlink chains
 * (e.g. `/tmp` → `/private/tmp` on macOS, `/var` → `/private/var`) hash to the
 * same state dir. Falls back to `path.resolve` when the path does not exist —
 * the function then stays pure for tests that pass synthetic paths.
 */
export function resolveDaemonPaths(workspacePath: string, home: string = os.homedir()): DaemonPaths {
  const resolved = path.resolve(workspacePath)
  let canonical: string
  try {
    canonical = fs.realpathSync(resolved)
  } catch {
    canonical = resolved
  }

  const workspaceHash = createHash('sha1').update(canonical).digest('hex').slice(0, HASH_LENGTH)

  const stateDir = path.join(home, STATE_DIR_NAME, workspaceHash)

  const socketPath =
    process.platform === 'win32' ? `\\\\.\\pipe\\mcp-graph-${workspaceHash}` : path.join(stateDir, 'daemon.sock')

  return {
    workspaceHash,
    stateDir,
    socketPath,
    pidFile: path.join(stateDir, 'daemon.pid'),
    logFile: path.join(stateDir, 'daemon.log'),
  }
}

/**
 * Create the state directory (`mkdir -p`, permissions 0o700).
 * Windows ignores the mode argument; callers should rely on default ACLs there.
 */
export function ensureStateDir(paths: DaemonPaths): void {
  fs.mkdirSync(paths.stateDir, { recursive: true, mode: 0o700 })
}
