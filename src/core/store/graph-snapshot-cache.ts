/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * GraphSnapshotCache — In-memory cache for getAllNodes()+getAllEdges().
 *
 * Provides a cached snapshot of the full graph state to avoid redundant
 * SQLite queries in loops (e.g., buildTaskContext, ragBuildContext).
 *
 * Auto-invalidated on any write operation via invalidate().
 */
import type { GraphNode, GraphEdge } from '../graph/graph-types.js'
import type { SqliteStore } from './sqlite-store.js'

export interface GraphSnapshot {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface SnapshotCacheStats {
  hits: number
  misses: number
}

export class GraphSnapshotCache {
  private store: SqliteStore
  private cached: GraphSnapshot | null = null
  private stats: SnapshotCacheStats = { hits: 0, misses: 0 }

  constructor(store: SqliteStore) {
    this.store = store
  }

  /**
   * Get cached graph snapshot. On first call (or after invalidation),
   * queries the database and caches the result. Subsequent calls
   * return the same reference without hitting SQLite.
   */
  getCachedSnapshot(): GraphSnapshot {
    if (this.cached) {
      this.stats.hits++
      return this.cached
    }

    this.stats.misses++
    this.cached = {
      nodes: this.store.getAllNodes(),
      edges: this.store.getAllEdges(),
    }
    return this.cached
  }

  /**
   * Invalidate the cached snapshot. Must be called after any write
   * operation (insertNode, updateNode, deleteNode, insertEdge, deleteEdge).
   */
  invalidate(): void {
    this.cached = null
  }

  /**
   * Get cache hit/miss statistics.
   */
  getStats(): SnapshotCacheStats {
    return { ...this.stats }
  }
}
