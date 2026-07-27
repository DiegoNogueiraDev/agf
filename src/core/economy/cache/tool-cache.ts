/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Tool-level memoization for read-only MCP tool calls.
 *
 * Keyed by hash(toolName + canonical(args) + schemaVersion) — the same call
 * with the same arguments returns the cached result inside the TTL window.
 * Allowlist enforced via the existing CACHEABLE_TOOLS set; mutating tools
 * never enter the cache.
 *
 * Invalidation: subscribes to GraphEventBus mutation events and clears the
 * entire cache on any write. Wholesale-clear is intentional — tracking
 * per-key dependencies is more code and less safe than a 30s TTL plus
 * blanket-flush on writes.
 */

import { LRUCache } from 'lru-cache'
import { buildCacheKey } from './cache-key.js'
import { CACHEABLE_TOOLS, type CacheableToolName } from '../_cacheable-tools.js'
import type { GraphEventBus } from '../../events/event-bus.js'
import type { GraphEventType } from '../../events/event-types.js'
import { createLogger } from '../../utils/logger.js'
import { DependencyTracker } from '../../cache/dependency-tracker.js'
import { BloomFilter } from '../../cache/bloom-filter.js'

const log = createLogger({ layer: 'core', source: 'tool-cache.ts' })

/** Bump when the cached result shape changes incompatibly. */
export const TOOL_CACHE_SCHEMA_VERSION = 1

const DEFAULT_TTL_MS = 30_000
const DEFAULT_MAX_ENTRIES = 500

/** Mutation events that should be checked for selective invalidation. */
const INVALIDATING_EVENTS: readonly GraphEventType[] = [
  'node:created',
  'node:updated',
  'node:deleted',
  'edge:created',
  'edge:deleted',
  'bulk:updated',
  'import:completed',
  'knowledge:indexed',
  'knowledge:deleted',
  'phase:transitioned',
]

/**
 * Minimal shape of an MCP tool result. Mirrors the public ToolResult contract
 * (see .claude/rules/mcp.md). We keep it loose because handlers may attach
 * structuredContent and extra fields we should preserve verbatim.
 */
export interface CachedToolResult {
  content: Array<{ type: string; text?: string }>
  isError?: boolean
  structuredContent?: unknown
}

export interface ToolCacheStats {
  size: number
  hits: number
  misses: number
  invalidations: number
}

interface ToolCacheOptions {
  ttlMs?: number
  maxEntries?: number
}

interface CacheEntry {
  value: CachedToolResult
  ts: number
}

export class ToolCache {
  private readonly lru: LRUCache<string, CacheEntry>
  private readonly ttlMs: number
  private hits = 0
  private misses = 0
  private invalidations = 0
  private busAttached = false
  private readonly deps = new DependencyTracker()
  private readonly bloom: BloomFilter

  constructor(options: ToolCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    this.lru = new LRUCache<string, CacheEntry>({ max: options.maxEntries ?? DEFAULT_MAX_ENTRIES })
    this.bloom = new BloomFilter(options.maxEntries ?? DEFAULT_MAX_ENTRIES, 0.01)
  }

  /** True iff the tool is in the read-only allowlist. */
  isCacheable(toolName: string): toolName is CacheableToolName {
    return CACHEABLE_TOOLS.has(toolName as CacheableToolName)
  }

  /**
   * Look up a cached result. Returns undefined for misses, expired entries,
   * or non-cacheable tool names.
   */
  get(toolName: string, args: unknown): CachedToolResult | undefined {
    if (!this.isCacheable(toolName)) return undefined
    const key = this.keyFor(toolName, args)
    const entry = this.lru.get(key)
    if (!entry) {
      this.misses++
      return undefined
    }
    if (Date.now() - entry.ts > this.ttlMs) {
      this.lru.delete(key)
      this.misses++
      return undefined
    }
    this.hits++
    return entry.value
  }

  /**
   * Store a successful result. Errors are never cached — masking a transient
   * failure for 30s is worse than re-running the handler.
   */
  set(toolName: string, args: unknown, value: CachedToolResult): void {
    if (!this.isCacheable(toolName)) return
    if (value.isError) return
    const key = this.keyFor(toolName, args)
    this.lru.set(key, { value, ts: Date.now() })
    this.bloom.add(key)

    // Extract node IDs from tool-specific args to track dependencies
    const nodeIds = this.extractNodeIds(toolName, args)
    if (nodeIds.length > 0) {
      this.deps.record(key, nodeIds)
    }
  }

  /**
   * Selective invalidation — only drops entries whose tracked dependencies
   * include at least one of the mutated node IDs.
   * Falls back to wholesale-clear when no dependency info exists.
   */
  selectiveInvalidate(mutatedNodeIds: string[], reason: string): void {
    if (this.lru.size === 0) return
    if (mutatedNodeIds.length === 0) return

    // Fast-path: BloomFilter check — if no cached keys include "node:" prefix, skip
    const hasAnyNodeDep = this.bloom.mightContain('node')
    if (!hasAnyNodeDep) {
      log.debug('tool-cache:bloom-skip', { reason })
      return
    }

    const affected = this.deps.getAffected(mutatedNodeIds)
    if (affected.length === 0) {
      log.debug('tool-cache:no-affected', { reason, mutatedCount: mutatedNodeIds.length })
      return
    }

    this.invalidations++
    for (const key of affected) {
      this.lru.delete(key)
      this.deps.remove(key)
    }
    log.debug('tool-cache:selective-invalidate', {
      reason,
      mutatedCount: mutatedNodeIds.length,
      clearedCount: affected.length,
    })
  }

  /** Drop every entry. Called when dependency info is incomplete or force=true. */
  invalidateAll(reason: string): void {
    if (this.lru.size === 0) return
    this.invalidations++
    log.debug('tool-cache:invalidate-all', { reason, size: this.lru.size })
    this.lru.clear()
    this.deps.clear()
    this.bloom.clear()
  }

  /**
   * Subscribe to mutation events on the given bus. Idempotent — subsequent
   * calls on the same bus are no-ops, since the wrapper is invoked once
   * per server boot but defensive code is cheap.
   * Uses selective invalidation: extracts node IDs from event payloads
   * so only affected cache entries are dropped.
   */
  attachEventBus(bus: GraphEventBus): void {
    if (this.busAttached) return
    this.busAttached = true
    for (const ev of INVALIDATING_EVENTS) {
      bus.on(ev, (event: unknown) => {
        const payload = event as Record<string, unknown> | undefined
        const nodeIds = this.extractNodeIdsFromEvent(payload)
        if (nodeIds.length > 0) {
          this.selectiveInvalidate(nodeIds, ev)
        } else {
          this.invalidateAll(ev)
        }
      })
    }
  }

  getStats(): ToolCacheStats {
    return {
      size: this.lru.size,
      hits: this.hits,
      misses: this.misses,
      invalidations: this.invalidations,
    }
  }

  /** Test seam: discard all entries and stats counters. */
  reset(): void {
    this.lru.clear()
    this.hits = 0
    this.misses = 0
    this.invalidations = 0
  }

  private keyFor(toolName: string, args: unknown): string {
    return buildCacheKey({ toolName, args, schemaVersion: TOOL_CACHE_SCHEMA_VERSION })
  }

  /** Extract node IDs from mutation event payload for targeted invalidation. */
  private extractNodeIdsFromEvent(event: Record<string, unknown> | undefined): string[] {
    if (!event) return []
    const ids: string[] = []

    if (typeof event.nodeId === 'string' && event.nodeId.startsWith('node_')) {
      ids.push(event.nodeId)
    }
    if (typeof event.id === 'string' && event.id.startsWith('node_')) {
      ids.push(event.id)
    }
    if (Array.isArray(event.nodeIds)) {
      for (const nid of event.nodeIds) {
        if (typeof nid === 'string' && nid.startsWith('node_')) ids.push(nid)
      }
    }
    if (Array.isArray(event.ids)) {
      for (const nid of event.ids) {
        if (typeof nid === 'string' && nid.startsWith('node_')) ids.push(nid)
      }
    }

    return ids
  }

  /** Extract node IDs from tool-specific arguments for dependency tracking. */
  private extractNodeIds(toolName: string, args: unknown): string[] {
    const ids: string[] = []
    if (args && typeof args === 'object') {
      const obj = args as Record<string, unknown>
      if (typeof obj.nodeId === 'string' && obj.nodeId.startsWith('node_')) {
        ids.push(obj.nodeId)
      }
      if (typeof obj.id === 'string' && obj.id.startsWith('node_')) {
        ids.push(obj.id)
      }
      if (Array.isArray(obj.nodeIds)) {
        for (const nid of obj.nodeIds) {
          if (typeof nid === 'string' && nid.startsWith('node_')) {
            ids.push(nid)
          }
        }
      }
      if (typeof obj.parentId === 'string' && obj.parentId.startsWith('node_')) {
        ids.push(obj.parentId)
      }
    }
    return ids
  }
}

/** Process-wide singleton — one cache per daemon. */
export const toolCache = new ToolCache()
