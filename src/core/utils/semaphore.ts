/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §S0 MAX_CONCURRENT_HEAVY — bounded-concurrency primitive for memory-heavy
 * MCP tools (context, analyze, search, export). Light tools must NOT acquire
 * — the bound is only useful when applied selectively.
 */

import { InvalidArgumentError } from './errors.js'

/**
 * Bounded-concurrency semaphore with a FIFO queue and per-acquire timeout.
 * Prevents heavy tool calls from running unbounded in parallel and blowing
 * up the heap.
 */

export interface SemaphoreOptions {
  /** Maximum concurrent acquisitions. Required, must be ≥ 1. */
  max: number
  /** Default ms a queued acquire waits before rejecting. Optional. */
  defaultTimeoutMs?: number
}

export interface SemaphoreStats {
  active: number
  queued: number
  max: number
}

export class QueueTimeoutError extends Error {
  readonly code = 'QUEUE_TIMEOUT' as const
  constructor(timeoutMs: number) {
    super(`Semaphore acquire timed out after ${timeoutMs}ms`)
    this.name = 'QueueTimeoutError'
  }
}

type Resolver = () => void

interface Waiter {
  resolve: (release: Resolver) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout | null
}

export class Semaphore {
  private readonly max: number
  private readonly defaultTimeoutMs: number | undefined
  private active = 0
  private readonly waiters: Waiter[] = []

  constructor(options: SemaphoreOptions) {
    if (!Number.isInteger(options.max) || options.max < 1) {
      throw new InvalidArgumentError('Semaphore: max must be a positive integer')
    }
    this.max = options.max
    this.defaultTimeoutMs = options.defaultTimeoutMs
  }

  /** Acquire a slot. Resolves with a `release()` function (idempotent). */
  acquire(timeoutMs?: number): Promise<Resolver> {
    if (this.active < this.max) {
      this.active++
      return Promise.resolve(this.makeRelease())
    }

    const effectiveTimeout = timeoutMs ?? this.defaultTimeoutMs
    return new Promise<Resolver>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: null,
      }

      if (effectiveTimeout !== undefined && effectiveTimeout > 0) {
        waiter.timer = setTimeout(() => {
          const idx = this.waiters.indexOf(waiter)
          if (idx !== -1) this.waiters.splice(idx, 1)
          reject(new QueueTimeoutError(effectiveTimeout))
        }, effectiveTimeout)
        // Allow Node to exit while a timer is pending in tests.
        if (typeof waiter.timer.unref === 'function') waiter.timer.unref()
      }

      this.waiters.push(waiter)
    })
  }

  /** Run `fn` under the semaphore; releases on success or failure. */
  async wrap<T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
    const release = await this.acquire(timeoutMs)
    try {
      return await fn()
    } finally {
      release()
    }
  }

  getStats(): SemaphoreStats {
    return { active: this.active, queued: this.waiters.length, max: this.max }
  }

  private makeRelease(): Resolver {
    let released = false
    return () => {
      if (released) return
      released = true
      const next = this.waiters.shift()
      if (next) {
        if (next.timer) clearTimeout(next.timer)
        // Slot stays accounted-for under the new owner.
        next.resolve(this.makeRelease())
      } else {
        this.active--
      }
    }
  }
}

/** Resolve `MAX_CONCURRENT_HEAVY` from env (default 2). */
export function getMaxConcurrentHeavy(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MAX_CONCURRENT_HEAVY
  if (!raw) return 2
  const nVar = Number(raw)
  if (!Number.isInteger(nVar) || nVar < 1) return 2
  return nVar
}
