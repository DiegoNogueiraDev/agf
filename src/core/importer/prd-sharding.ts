/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * PRD Sharding — partitions large PRD text into section-aligned shards,
 * processes each independently, and consolidates results.
 *
 * Design:
 *   - Shards split on `## Heading` boundaries (never mid-section)
 *   - Each shard is parsed independently; failures are isolated
 *   - Cross-ref edges: when node B's description mentions node A's title → relates_to edge
 *   - Boundary marker `---SHARD_BOUNDARY---` is supported as an explicit split point
 *
 * Pure functions: no file I/O, no store access.
 */

import type { GraphNode, GraphEdge } from '../graph/graph-types.js'
import { extractEntities } from '../parser/extract.js'
import { convertToGraph } from './prd-to-graph.js'
import { generateId } from '../utils/id.js'
import { now } from '../utils/time.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'prd-sharding.ts' })

// ── Types ──────────────────────────────────────────────────────────────────

export interface ShardPayload {
  readonly nodes: GraphNode[]
  readonly edges: GraphEdge[]
}

export interface PrdShardingOptions {
  /** Approximate token budget per shard (1 token ≈ 4 chars; default: 8000 tokens) */
  readonly tokenBudget?: number
  /** Source file label for node metadata */
  readonly sourceFile?: string
  /**
   * Override the per-shard parse function (default: extractEntities + convertToGraph).
   * Used for testing and dry-run scenarios.
   */
  readonly parseShardFn?: (shardText: string, sourceFile: string) => ShardPayload
}

export interface PrdShardingResult {
  readonly nodes: GraphNode[]
  readonly edges: GraphEdge[]
  /** 0-indexed shard indices that failed to parse */
  readonly failedShards: number[]
  /** Error messages for each failed shard (parallel to failedShards) */
  readonly shardErrors: string[]
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Split PRD text into section-aligned shards that stay within the token budget.
 * Respects explicit `---SHARD_BOUNDARY---` markers and `## Heading` boundaries.
 */
export function shardPrdText(text: string, tokenBudget: number): string[] {
  // First split on explicit boundary markers (used in tests / manual sharding)
  if (text.includes('---SHARD_BOUNDARY---')) {
    return text
      .split('---SHARD_BOUNDARY---')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const charBudget = tokenBudget * 4

  // Split on `## ` or `### ` headings — section boundaries
  const sections = text.split(/(?=^#{2,3} )/m).filter(Boolean)

  const shards: string[] = []
  let current = ''

  for (const section of sections) {
    if (current.length + section.length > charBudget && current.length > 0) {
      shards.push(current.trim())
      current = section
    } else {
      current += (current ? '\n\n' : '') + section
    }
  }

  if (current.trim()) shards.push(current.trim())

  return shards.length > 0 ? shards : [text]
}

/**
 * Import a (potentially large) PRD text as sharded batches.
 *
 * Shards are processed independently. Parse failures are caught per shard
 * and reported in `failedShards` without aborting the overall import.
 * Cross-ref edges are resolved after all shards have been processed.
 */
export function importShardedPrd(text: string, options: PrdShardingOptions = {}): PrdShardingResult {
  const { tokenBudget = 8000, sourceFile = 'prd', parseShardFn } = options
  const parseFn = parseShardFn ?? defaultParseShard

  const shards = shardPrdText(text, tokenBudget)
  log.info('prd-sharding:start', { shards: shards.length, tokenBudget })

  const allNodes: GraphNode[] = []
  const allEdges: GraphEdge[] = []
  const failedShards: number[] = []
  const shardErrors: string[] = []

  for (let i = 0; i < shards.length; i++) {
    try {
      const payload = parseFn(shards[i], sourceFile)
      allNodes.push(...payload.nodes)
      allEdges.push(...payload.edges)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      failedShards.push(i)
      shardErrors.push(msg)
      log.warn('prd-sharding:shard_failed', { shardIndex: i, error: msg })
    }
  }

  // Resolve cross-shard references and add relates_to edges
  const crossRefEdges = resolveCrossShardRefs(allNodes)
  for (const edge of crossRefEdges) {
    const duplicate = allEdges.some(
      (e) => e.from === edge.from && e.to === edge.to && e.relationType === edge.relationType,
    )
    if (!duplicate) {
      allEdges.push(edge)
    }
  }

  log.info('prd-sharding:done', {
    nodes: allNodes.length,
    edges: allEdges.length,
    failed: failedShards.length,
  })

  return { nodes: allNodes, edges: allEdges, failedShards, shardErrors }
}

// ── Private ────────────────────────────────────────────────────────────────

function defaultParseShard(shardText: string, sourceFile: string): ShardPayload {
  const extraction = extractEntities(shardText)
  const { nodes, edges } = convertToGraph(extraction, sourceFile)
  return { nodes, edges }
}

/**
 * Find cross-shard references: when node B's title/description mentions node A's
 * title (exact case-insensitive match), emit a `relates_to` edge from B → A.
 */
function resolveCrossShardRefs(nodes: readonly GraphNode[]): GraphEdge[] {
  const edges: GraphEdge[] = []
  const timestamp = now()

  for (const nodeB of nodes) {
    const searchText = [nodeB.description ?? '', ...(nodeB.acceptanceCriteria ?? [])].join(' ').toLowerCase()

    for (const nodeA of nodes) {
      if (nodeA.id === nodeB.id) continue
      if (!nodeA.title) continue

      const titleLower = nodeA.title.toLowerCase()
      if (titleLower.length < 3) continue // Skip very short titles to avoid false positives

      if (searchText.includes(titleLower)) {
        edges.push({
          id: generateId('edge'),
          from: nodeB.id,
          to: nodeA.id,
          relationType: 'related_to',
          createdAt: timestamp,
        })
      }
    }
  }

  return edges
}
