/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { randomUUID } from 'node:crypto'
import { getSharedHookBus } from './shared-hook-bus.js'

/**
 * Session lifecycle hook helpers.
 *
 * Emits session:start once per process and session:end once on shutdown,
 * regardless of how many signals fire (SIGINT + SIGTERM during double
 * Ctrl-C). Idempotency keeps audit logs clean.
 */

let sessionId: string | null = null
let sessionEnded = false

/** emitSessionStart —  */
export function emitSessionStart(): string {
  if (sessionId) return sessionId
  sessionId = randomUUID()
  void getSharedHookBus().emit({
    channel: 'session:start',
    timestamp: new Date().toISOString(),
    payload: { sessionId, startedAt: new Date().toISOString() },
  })
  return sessionId
}

/** emitSessionEnd —  */
export function emitSessionEnd(reason: string): boolean {
  if (sessionEnded) return false
  sessionEnded = true
  void getSharedHookBus().emit({
    channel: 'session:end',
    timestamp: new Date().toISOString(),
    payload: {
      sessionId: sessionId ?? 'unknown',
      reason,
      endedAt: new Date().toISOString(),
    },
  })
  return true
}

/** Test-only: reset module state. Production code should not call this. */
export function _resetSessionLifecycleForTesting(): void {
  sessionId = null
  sessionEnded = false
}

/**
 * Install process listeners that emit session:end on graceful shutdown.
 * Returns a disposer that removes the listeners (also test-only useful).
 */
export function installSessionEndHandlers(
  proc: NodeJS.Process = process,
  signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'],
): () => void {
  const handlers: Array<{ signal: NodeJS.Signals | 'beforeExit'; fn: () => void }> = []
  for (const signal of signals) {
    const fn = (): void => {
      emitSessionEnd(signal)
    }
    proc.on(signal, fn)
    handlers.push({ signal, fn })
  }
  const beforeExitFn = (): void => {
    emitSessionEnd('beforeExit')
  }
  proc.on('beforeExit', beforeExitFn)
  handlers.push({ signal: 'beforeExit', fn: beforeExitFn })

  return () => {
    for (const { signal, fn } of handlers) {
      proc.off(signal as NodeJS.Signals, fn)
    }
  }
}
