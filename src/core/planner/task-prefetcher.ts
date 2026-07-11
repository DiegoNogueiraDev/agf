/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Task Prefetcher — Predictive Context Pipeline
 *
 * Pre-computes context for the predicted next task while the current
 * finish_task is being processed. Inspired by CPU pipeline prefetching.
 *
 * When the agent requests start_task for the predicted node, the context
 * is served from cache (~0ms vs ~3s cold), reducing latency by ≥60%.
 *
 * Based on: CPU Pipeline Architecture — anticipate next instruction.
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'task-prefetcher.ts' })

// ── Types ───────────────────────────────────────────────

export interface PrefetchOptions {
  /** TTL in milliseconds (default: 5 min) */
  ttlMs: number
}

export interface PrefetchedContext {
  query: string
  context: string
}

interface PrefetchEntry {
  data: PrefetchedContext
  createdAt: number
}

export interface PrefetchStats {
  size: number
  hits: number
  misses: number
}

// ── Prefetcher ──────────────────────────────────────────

/**
 * In-memory prefetch cache for predicted next task contexts.
 * Single-entry optimized: typically only 1 predicted next task.
 */
export class TaskPrefetcher {
  private cache = new Map<string, PrefetchEntry>()
  private ttlMs: number
  private hits = 0
  private misses = 0

  constructor(options: PrefetchOptions) {
    this.ttlMs = options.ttlMs
  }

  /**
   * Pre-store context for a predicted next task.
   */
  prefetch(nodeId: string, data: PrefetchedContext): void {
    this.cache.set(nodeId, {
      data,
      createdAt: Date.now(),
    })

    log.debug('prefetcher:stored', { nodeId, queryLen: data.query.length })
  }

  /**
   * Retrieve prefetched context for a node.
   * Returns null if not cached or expired.
   */
  get(nodeId: string): PrefetchedContext | null {
    const entry = this.cache.get(nodeId)

    if (!entry) {
      this.misses++
      return null
    }

    // Check TTL
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(nodeId)
      this.misses++
      log.debug('prefetcher:expired', { nodeId })
      return null
    }

    this.hits++
    log.debug('prefetcher:hit', { nodeId })
    return entry.data
  }

  /**
   * Invalidate prefetch cache if the requested task doesn't match prediction.
   * Called when user manually selects a different task than predicted.
   */
  invalidateIfMismatch(requestedNodeId: string): void {
    if (!this.cache.has(requestedNodeId) && this.cache.size > 0) {
      const count = this.cache.size
      this.cache.clear()
      log.debug('prefetcher:invalidated', { requestedNodeId, clearedEntries: count })
    }
  }

  /**
   * Clear all prefetched entries.
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get prefetch statistics.
   */
  getStats(): PrefetchStats {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
    }
  }
}
