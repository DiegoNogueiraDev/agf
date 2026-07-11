/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-6.T04 — LLM response cache (LRU in-memory + TTL persistence).
 *
 * Two-tier:
 *   - LRU (in-memory hot path) — O(1) Map-based access, capacity-limited.
 *   - TTL persistence — caller injects a SQLite-backed store; expired
 *     entries pruned lazily on read.
 *
 * Cache invalidation: bumping the schemaVersion drops every entry whose
 * meta.schemaVersion doesn't match. This module is pure; the SQLite
 * adapter lives in the caller (response-cache-sqlite.ts).
 */

import { fnv1a32 } from '../cache/cache-types.js'
import { emitEconomyHook } from '../hooks/economy-lifecycle-hooks.js'

/** Stable 32-bit hash for cache keys (FNV-1a) — delegates to unified implementation. */
export function hashKey(input: string): string {
  return fnv1a32(input)
}

export const DEFAULT_LRU_CAPACITY = 256
export const DEFAULT_TTL_MS = 60 * 60 * 1000 // 1h

export interface CacheEntry<V> {
  key: string
  value: V
  schemaVersion: number
  createdAtMs: number
  expiresAtMs: number
}

export interface CachePersistence<V> {
  read(key: string): CacheEntry<V> | undefined
  write(entry: CacheEntry<V>): void
  prune(beforeMs: number): number
  invalidateBySchema(currentSchemaVersion: number): number
  clear(): number
  size(): number
}

export interface ResponseCacheOptions<V> {
  capacity?: number
  ttlMs?: number
  schemaVersion: number
  now?: () => number
  persistence?: CachePersistence<V>
}

/** O(1) LRU using insertion-ordered Map. */
class LRUMap<V> {
  private readonly map = new Map<string, V>()
  constructor(private readonly capacity: number) {}

  get(key: string): V | undefined {
    const value = this.map.get(key)
    if (value === undefined) return undefined
    this.map.delete(key)
    this.map.set(key, value)
    return value
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
  }

  delete(key: string): boolean {
    return this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }

  size(): number {
    return this.map.size
  }
}

export class ResponseCache<V> {
  private readonly lru: LRUMap<CacheEntry<V>>
  private readonly ttlMs: number
  private readonly schemaVersion: number
  private readonly now: () => number
  private readonly persistence?: CachePersistence<V>

  constructor(opts: ResponseCacheOptions<V>) {
    this.lru = new LRUMap(opts.capacity ?? DEFAULT_LRU_CAPACITY)
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS
    this.schemaVersion = opts.schemaVersion
    this.now = opts.now ?? (() => Date.now())
    this.persistence = opts.persistence
  }

  get(key: string): V | undefined {
    const hash = hashKey(key)
    const ts = this.now()

    const memEntry = this.lru.get(hash)
    if (memEntry && this.isFresh(memEntry, ts)) {
      emitEconomyHook('on_cache_hit', { hash, layer: 'memory' })
      return memEntry.value
    }
    if (memEntry) this.lru.delete(hash)

    if (this.persistence) {
      const persisted = this.persistence.read(hash)
      if (persisted) {
        if (this.isFresh(persisted, ts)) {
          this.lru.set(hash, persisted)
          emitEconomyHook('on_cache_hit', { hash, layer: 'persistence' })
          return persisted.value
        }
        // expired — surface a prune opportunity
        this.persistence.prune(ts)
      }
    }
    emitEconomyHook('on_cache_miss', { hash })
    return undefined
  }

  set(key: string, value: V): CacheEntry<V> {
    const hash = hashKey(key)
    const createdAtMs = this.now()
    const entry: CacheEntry<V> = {
      key: hash,
      value,
      schemaVersion: this.schemaVersion,
      createdAtMs,
      expiresAtMs: createdAtMs + this.ttlMs,
    }
    this.lru.set(hash, entry)
    this.persistence?.write(entry)
    return entry
  }

  invalidateAll(): void {
    this.lru.clear()
    this.persistence?.clear()
  }

  /** Drop any entry whose schemaVersion no longer matches the current one. */
  invalidateOnSchemaBump(): number {
    this.lru.clear()
    return this.persistence?.invalidateBySchema(this.schemaVersion) ?? 0
  }

  size(): number {
    return this.lru.size()
  }

  private isFresh(entry: CacheEntry<V>, ts: number): boolean {
    if (entry.schemaVersion !== this.schemaVersion) return false
    return ts < entry.expiresAtMs
  }
}

/** Helper: in-memory persistence stub useful for testing the contract. */
export function createMemoryPersistence<V>(): CachePersistence<V> {
  const store = new Map<string, CacheEntry<V>>()
  return {
    read: (key) => store.get(key),
    write: (entry) => {
      store.set(entry.key, entry)
    },
    prune: (beforeMs) => {
      let removed = 0
      for (const [k, e] of store) {
        if (e.expiresAtMs <= beforeMs) {
          store.delete(k)
          removed++
        }
      }
      return removed
    },
    invalidateBySchema: (currentSchemaVersion) => {
      let removed = 0
      for (const [k, e] of store) {
        if (e.schemaVersion !== currentSchemaVersion) {
          store.delete(k)
          removed++
        }
      }
      return removed
    },
    clear: () => {
      const nVar = store.size
      store.clear()
      return nVar
    },
    size: () => store.size,
  }
}
