/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-21.T13 — approval-timeout-escalate.
 * Tracker que arma timers por approval-id e dispara escalation callback
 * quando o approval não é resolvido dentro do timeout. O hook builtin em
 * approval:required usa este tracker; o sinal de resolution vem de fora
 * (signal-file-watcher ou re-emit).
 */

const DEFAULT_TIMEOUT_MS = 300_000 // 5 min

/** getApprovalTimeoutMs —  */
export function getApprovalTimeoutMs(env: NodeJS.ProcessEnv | Record<string, string | undefined>): number {
  const raw = env.MCP_GRAPH_APPROVAL_TIMEOUT_MS
  if (!raw) return DEFAULT_TIMEOUT_MS
  const nVar = Number.parseInt(raw, 10)
  if (!Number.isInteger(nVar) || nVar < 1) return DEFAULT_TIMEOUT_MS
  return nVar
}

export type TimeoutCallback = (approvalId: string, context: Record<string, unknown>) => void

export class ApprovalTimeoutTracker {
  private readonly timers = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly timeoutMs: number,
    private readonly onTimeout: TimeoutCallback,
  ) {}

  /** Arm a timer for `approvalId`. Re-arming replaces any prior timer. */
  arm(approvalId: string, context: Record<string, unknown>): void {
    this.cancelTimer(approvalId)
    const timer = setTimeout(() => {
      this.timers.delete(approvalId)
      this.onTimeout(approvalId, context)
    }, this.timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()
    this.timers.set(approvalId, timer)
  }

  /** Cancel the timer for `approvalId`. Silent no-op when unknown. */
  resolve(approvalId: string): void {
    this.cancelTimer(approvalId)
  }

  /** Cancel all timers — useful for test teardown / shutdown. */
  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
  }

  /** Number of timers currently armed (for diagnostics). */
  get pending(): number {
    return this.timers.size
  }

  private cancelTimer(approvalId: string): void {
    const tVar = this.timers.get(approvalId)
    if (tVar) {
      clearTimeout(tVar)
      this.timers.delete(approvalId)
    }
  }
}
