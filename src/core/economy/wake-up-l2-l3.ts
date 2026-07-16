/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2026 MemPalace Contributors (mempalace)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from mempalace (https://github.com/MemPalace/mempalace), MIT.
 * This file stays under its original MIT terms; agent-graph-flow as a whole
 * is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 */

import { computeRrfScore, type RrfConfig, DEFAULT_RRF_K } from './rrf.js'
import { rankChunksByBm25 } from '../context/bm25-compressor.js'
import { estimateTokens } from '../context/token-estimator.js'
import type { MemoryItem } from './wake-up.js'

export interface L2SearchResult {
  content: string
  items: MemoryItem[]
  tokenCount: number
}

export interface L3SearchResult {
  content: string
  items: Array<MemoryItem & { rrfScore: number; bm25Score: number }>
  tokenCount: number
}

export interface L2SearchOptions {
  maxTokens?: number
  topK?: number
}

export interface L3SearchOptions {
  maxTokens?: number
  topK?: number
  rrfConfig?: RrfConfig
}

function tokenOverlap(query: string, content: string): number {
  const queryTokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1)
  const contentTokens = new Set(content.toLowerCase().split(/\s+/))
  const matches = queryTokens.filter((t) => contentTokens.has(t)).length
  return queryTokens.length > 0 ? matches / queryTokens.length : 0
}

export function searchL2(items: MemoryItem[], query: string, options?: L2SearchOptions): L2SearchResult {
  if (items.length === 0 || !query.trim()) {
    return { content: '', items: [], tokenCount: 0 }
  }

  const maxTokens = options?.maxTokens ?? 400
  const topK = options?.topK ?? 5

  const scored = items
    .map((item) => ({ item, score: tokenOverlap(query, item.content) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  let content = ''
  let tokenCount = 0
  const included: MemoryItem[] = []

  for (const { item } of scored) {
    const line = `[L2:on-demand:${query}] ${item.content}`
    const lineTokens = estimateTokens(line)
    if (tokenCount + lineTokens > maxTokens && included.length > 0) break
    content += (content ? '\n' : '') + line
    tokenCount += lineTokens
    included.push(item)
  }

  return { content, items: included, tokenCount }
}

export function searchL3(items: MemoryItem[], query: string, options?: L3SearchOptions): L3SearchResult {
  if (items.length === 0 || !query.trim()) {
    return { content: '', items: [], tokenCount: 0 }
  }

  const maxTokens = options?.maxTokens ?? 800
  const topK = options?.topK ?? 10
  const rrfConfig = options?.rrfConfig ?? {
    k: DEFAULT_RRF_K,
    weights: { bm25: 1 / 3, vector: 1 / 3, graph: 1 / 3 },
  }

  const chunks = items.map((i) => i.content)
  const bm25Ranked = rankChunksByBm25(chunks, query)

  const bm25Map = new Map<string, { content: string; bm25Index: number; bm25Score: number }>()
  bm25Ranked.forEach((r, idx) => {
    bm25Map.set(r.content, { content: r.content, bm25Index: idx + 1, bm25Score: r.score })
  })

  const scored = items
    .map((item) => {
      const bm25 = bm25Map.get(item.content)
      const bm25Rank = bm25?.bm25Index ?? 999
      const bm25Score = bm25?.bm25Score ?? 0
      const rrfScore = computeRrfScore(
        {
          bm25Rank,
          vectorRank: item.vectorRank,
          graphRank: item.graphRank,
        },
        rrfConfig,
      )
      return { item, rrfScore, bm25Score }
    })
    .filter((s) => s.bm25Score > 0)
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, topK)

  let content = ''
  let tokenCount = 0
  const included: Array<MemoryItem & { rrfScore: number; bm25Score: number }> = []

  for (const { item, rrfScore, bm25Score } of scored) {
    const line = `[L3:deep] ${item.content}`
    const lineTokens = estimateTokens(line)
    if (tokenCount + lineTokens > maxTokens && included.length > 0) break
    content += (content ? '\n' : '') + line
    tokenCount += lineTokens
    included.push({ ...item, rrfScore, bm25Score })
  }

  return { content, items: included, tokenCount }
}
