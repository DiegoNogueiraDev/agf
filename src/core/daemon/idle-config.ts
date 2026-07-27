/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Idle auto-shutdown configuration for the per-workspace daemon.
 *
 * A daemon with zero connected clients self-terminates after this window.
 * This is the root-cause fix for daemon leaks: every session or test that
 * boots a daemon and exits without sending SIGTERM would otherwise leave the
 * daemon orphaned at PPID 1 forever, accumulating SqliteStore instances in
 * memory until the host swaps and freezes.
 *
 * The default is intentionally non-zero. `MCP_DAEMON_IDLE_MS=0` is still
 * honoured as an explicit opt-out for long-running interactive setups where a
 * cold respawn between tasks is undesirable.
 */

/** Default idle window: 10 minutes with no connected clients. */
export const DEFAULT_DAEMON_IDLE_MS = 10 * 60 * 1000

/**
 * Resolve the effective idle-shutdown window from the raw `MCP_DAEMON_IDLE_MS`
 * environment value.
 *
 * - unset            → {@link DEFAULT_DAEMON_IDLE_MS} (10 min)
 * - `"0"`            → `undefined` (explicit opt-out — daemon never idle-exits)
 * - a positive int   → that value in milliseconds
 * - garbage/negative → {@link DEFAULT_DAEMON_IDLE_MS} (fail safe, never leak)
 *
 * `undefined` means "no idle timer"; any number means "exit after N ms idle".
 */
export function resolveIdleShutdownMs(raw: string | undefined): number | undefined {
  if (raw === undefined) return DEFAULT_DAEMON_IDLE_MS
  const parsed = parseInt(raw, 10)
  if (Number.isFinite(parsed)) {
    if (parsed === 0) return undefined
    if (parsed > 0) return parsed
  }
  // Negative or non-numeric input is a misconfiguration — fall back to the
  // default rather than the leak-prone "never exit" behaviour.
  return DEFAULT_DAEMON_IDLE_MS
}

export interface IdleWatcher {
  /** Call on any activity to defer the next `onIdle` firing. */
  touch(): void
  /** Stop watching and clear the underlying timer. */
  stop(): void
}

export interface IdleWatcherOptions {
  /** Polling interval for the idle check, ms (default: min(idleMs / 4, 60_000)). */
  checkIntervalMs?: number
  /** Injectable clock, for tests. */
  now?: () => number
}

/**
 * Starts a watcher that invokes `onIdle` once no `touch()` call has happened
 * for `idleMs`. This is the consumer half of {@link resolveIdleShutdownMs}:
 * pass its result straight through — `undefined` means "no idle timer"
 * (explicit opt-out), so this returns `undefined` too rather than creating
 * a watcher that would fire immediately.
 */
export function createIdleWatcher(
  idleMs: number | undefined,
  onIdle: () => void,
  opts: IdleWatcherOptions = {},
): IdleWatcher | undefined {
  if (idleMs === undefined) return undefined
  const now = opts.now ?? Date.now
  const checkIntervalMs = opts.checkIntervalMs ?? Math.min(idleMs / 4, 60_000)
  let lastActivity = now()
  const timer = setInterval(() => {
    if (now() - lastActivity >= idleMs) {
      clearInterval(timer)
      onIdle()
    }
  }, checkIntervalMs)
  timer.unref?.()
  return {
    touch() {
      lastActivity = now()
    },
    stop() {
      clearInterval(timer)
    },
  }
}
