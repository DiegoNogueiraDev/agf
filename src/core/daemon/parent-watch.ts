/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Parent-death detection for processes spawned by an agent host.
 *
 * When the host (Claude Code, etc.) dies, a stdio MCP server should exit too —
 * otherwise it leaks. `stdin` EOF is the usual signal, but it can be missed if
 * the descriptor is held open. `process.ppid` is the reliable backstop: on
 * Unix, the death of a parent reparents the child to PID 1, so a change in
 * `process.ppid` from its startup value means "the host is gone".
 */

const DEFAULT_POLL_MS = 30_000

export interface ParentWatchHandle {
  /** Stop polling. Idempotent. */
  stop(): void
}

export interface ParentWatchOptions {
  /** Poll interval in ms. Default 30s. */
  pollMs?: number
  /** PID reader — injectable for tests. Default `() => process.ppid`. */
  readPpid?: () => number
}

/**
 * Invoke `onDeath` once when the parent process changes (i.e. the original
 * parent exited and this process was reparented). The poll timer is `unref`'d
 * so it never keeps the event loop alive on its own.
 */
export function watchParentDeath(onDeath: () => void, options: ParentWatchOptions = {}): ParentWatchHandle {
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS
  const readPpid = options.readPpid ?? (() => process.ppid)

  const initialPpid = readPpid()
  let fired = false

  const timer = setInterval(() => {
    if (fired) return
    if (readPpid() !== initialPpid) {
      fired = true
      clearInterval(timer)
      onDeath()
    }
  }, pollMs)
  // Node typings: setInterval returns a Timeout with .unref() on Node.
  timer.unref()

  return {
    stop(): void {
      clearInterval(timer)
    },
  }
}
