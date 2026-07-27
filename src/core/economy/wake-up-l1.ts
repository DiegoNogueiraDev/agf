/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2026 MemPalace Contributors (mempalace)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from mempalace (https://github.com/MemPalace/mempalace), MIT.
 * This file stays under its original MIT terms; agent-graph-flow as a whole
 * is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 */

import { computeRetentionScore, classifyTier, type RetentionConfig } from './retention.js'
import { computeRrfScore, type RrfConfig, DEFAULT_RRF_K } from './rrf.js'
import { estimateTokens } from '../context/token-estimator.js'
import type { MemoryItem } from './wake-up.js'

export interface L1MemoryItem {
  id: string
  content: string
  retentionScore: number
  rrfScore: number
}

export interface L1EssentialOptions {
  maxTokens?: number
  retentionConfig?: RetentionConfig
  rrfConfig?: RrfConfig
}

export interface L1EssentialResult {
  content: string
  items: L1MemoryItem[]
  tokenCount: number
  consideredCount: number
  avgRetentionScore: number
  avgRrfScore: number
}

const RETENTION_HOT_THRESHOLD = 0.7

export function buildL1Essential(memoryItems: MemoryItem[], options?: L1EssentialOptions): L1EssentialResult {
  const maxTokens = options?.maxTokens ?? 800
  const retentionConfig = options?.retentionConfig ?? { lambda: 0.01, sigma: 0.3 }
  const rrfConfig = options?.rrfConfig ?? {
    k: DEFAULT_RRF_K,
    weights: { bm25: 1 / 3, vector: 1 / 3, graph: 1 / 3 },
  }

  const scored = memoryItems
    .map((item) => ({
      item,
      retentionScore: computeRetentionScore(item.score, item.ageDays, retentionConfig),
      rrfScore: computeRrfScore(
        { bm25Rank: item.bm25Rank, vectorRank: item.vectorRank, graphRank: item.graphRank },
        rrfConfig,
      ),
    }))
    .filter(({ retentionScore }) => retentionScore >= RETENTION_HOT_THRESHOLD)
    .sort((a, b) => b.rrfScore - a.rrfScore)

  let content = ''
  let tokenCount = 0
  const included: L1MemoryItem[] = []

  for (const { item, retentionScore, rrfScore } of scored) {
    const line = `[L1:${classifyTier(retentionScore)}] ${item.content}`
    const lineTokens = estimateTokens(line)
    if (tokenCount + lineTokens > maxTokens && included.length > 0) break
    content += (content ? '\n' : '') + line
    tokenCount += lineTokens
    included.push({ id: item.id, content: item.content, retentionScore, rrfScore })
  }

  const avgRetention = included.length > 0 ? included.reduce((s, i) => s + i.retentionScore, 0) / included.length : 0
  const avgRrf = included.length > 0 ? included.reduce((s, i) => s + i.rrfScore, 0) / included.length : 0

  return {
    content,
    items: included,
    tokenCount,
    consideredCount: memoryItems.length,
    avgRetentionScore: avgRetention,
    avgRrfScore: avgRrf,
  }
}
