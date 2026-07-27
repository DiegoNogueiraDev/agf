/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Sprint M4 (Multi-CLI PRD) — in-memory dedup window.
 *
 * Used to prevent double-fire when both the MCP path (unified-gate)
 * and fs-watcher detect the same file Edit. MCP path calls
 * recordEmission() first; fs-watcher then calls shouldEmit() and
 * suppresses if a recent entry exists.
 *
 * Key shape (caller's responsibility): `${agentSource}:${filePath}:${toolName}`.
 *
 * Per-process state — does NOT persist. Map auto-evicts on access after
 * the window expires; periodic explicit pruning is unnecessary for
 * typical dev-mode usage but available via reset() in tests.
 */
export class HookDedupStore {
  private readonly recent = new Map<string, number>()

  constructor(private readonly windowMs: number = 200) {}

  shouldEmit(key: string, now: number = Date.now()): boolean {
    const last = this.recent.get(key)
    if (last !== undefined && now - last < this.windowMs) return false
    if (last !== undefined && now - last >= this.windowMs) this.recent.delete(key)
    return true
  }

  recordEmission(key: string, now: number = Date.now()): void {
    this.recent.set(key, now)
  }

  /** Test-only: clear state. */
  reset(): void {
    this.recent.clear()
  }

  /** Prune expired entries. Optional housekeeping. */
  prune(now: number = Date.now()): number {
    let pruned = 0
    for (const [key, t] of this.recent) {
      if (now - t >= this.windowMs) {
        this.recent.delete(key)
        pruned++
      }
    }
    return pruned
  }
}
