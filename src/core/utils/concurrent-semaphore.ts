/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { HEAVY_TOOLS } from './memory-guard.js'

export { HEAVY_TOOLS }

/** Release function returned by acquire(). */
type Releaser = () => void

interface QueueEntry {
  resolve: (r: Releaser) => void
  reject: (e: Error) => void
}

interface ConcurrencyLimitResult {
  isError: true
  content: [{ type: 'text'; text: string }]
}

/** MAX_CONCURRENT_HEAVY — configurable via env, default 2. */
export const MAX_CONCURRENT_HEAVY: number = (() => {
  const vVar = parseInt(process.env['MAX_CONCURRENT_HEAVY'] ?? '', 10)
  return Number.isFinite(vVar) && vVar > 0 ? vVar : 2
})()

/** QUEUE_TIMEOUT_MS — max wait time in the concurrency queue before rejection. */
export const QUEUE_TIMEOUT_MS = 30_000

/**
 * Counting semaphore with FIFO queue and per-waiter timeout.
 *
 * Heavy tools (context, analyze, search, export, …) are limited to
 * maxConcurrent simultaneous executions. Light tools bypass entirely via
 * checkForTool() returning null.
 *
 * maxQueued=0 makes checkForTool() reject synchronously instead of queuing —
 * useful for testing or strict load-shedding.
 */
export class ConcurrentSemaphore {
  private _active = 0
  private _queue: QueueEntry[] = []

  constructor(
    private readonly maxConcurrent: number,
    private readonly timeoutMs: number = QUEUE_TIMEOUT_MS,
    private readonly maxQueued: number = Infinity,
  ) {}

  get active(): number {
    return this._active
  }

  get queued(): number {
    return this._queue.length
  }

  /** Acquire a slot. Resolves with a release function. May wait if all slots are busy. */
  acquire(_toolName: string): Promise<Releaser> {
    if (this._active < this.maxConcurrent) {
      this._active++
      return Promise.resolve(() => this._release())
    }

    return new Promise<Releaser>((resolve, reject) => {
      const holder: { entry: QueueEntry | null } = { entry: null }

      const timer = setTimeout(() => {
        if (!holder.entry) return
        const idx = this._queue.indexOf(holder.entry)
        if (idx !== -1) this._queue.splice(idx, 1)
        reject(new Error(`QUEUE_TIMEOUT: tool waited > ${this.timeoutMs}ms in concurrency queue`))
      }, this.timeoutMs)

      holder.entry = {
        resolve: (r: Releaser) => {
          clearTimeout(timer)
          resolve(r)
        },
        reject,
      }

      this._queue.push(holder.entry)
    })
  }

  private _release(): void {
    this._active--
    const next = this._queue.shift()
    if (next) {
      this._active++
      next.resolve(() => this._release())
    }
  }

  /**
   * Synchronous pre-flight check — returns a CONCURRENCY_LIMIT error if the
   * tool is heavy AND no slot is available AND the queue is at capacity.
   * Returns null for light tools or when a slot is free.
   */
  checkForTool(toolName: string): ConcurrencyLimitResult | null {
    if (!HEAVY_TOOLS.includes(toolName)) return null
    if (this._active < this.maxConcurrent) return null
    if (this._queue.length < this.maxQueued) return null

    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: `CONCURRENCY_LIMIT: ${this.maxConcurrent} heavy tool requests already active. Tool "${toolName}" rejected — ${this._queue.length} requests queued. Wait for current operations to complete or restart daemon: mcp-graph daemon restart`,
        },
      ],
    }
  }
}
