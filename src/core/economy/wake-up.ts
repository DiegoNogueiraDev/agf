/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2026 MemPalace Contributors (mempalace)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from mempalace (https://github.com/MemPalace/mempalace), MIT.
 * This file stays under its original MIT terms; agent-graph-flow as a whole
 * is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 */

import { computeRetentionScore, classifyTier, type RetentionConfig, type MemoryTier } from './retention.js'
import { computeRrfScore, type RrfConfig, DEFAULT_RRF_K } from './rrf.js'
import { estimateTokens } from '../context/token-estimator.js'

export const DEFAULT_RRF_WEIGHTS = {
  bm25: 1 / 3,
  vector: 1 / 3,
  graph: 1 / 3,
}

export interface WakeUpConfig {
  budget: number
  retentionConfig: RetentionConfig
  rrfConfig: RrfConfig
  maxL1Items: number
  maxL0Tokens: number
}

export const DEFAULT_WAKEUP_CONFIG: WakeUpConfig = {
  budget: 900,
  retentionConfig: { lambda: 0.01, sigma: 0.3 },
  rrfConfig: { k: DEFAULT_RRF_K, weights: { bm25: 1 / 3, vector: 1 / 3, graph: 1 / 3 } },
  maxL1Items: 10,
  maxL0Tokens: 150,
}

export interface MemoryItem {
  id: string
  content: string
  score: number
  ageDays: number
  bm25Rank: number
  vectorRank: number
  graphRank: number
  retentionScore?: number
  rrfScore?: number
}

export interface Layer0Profile {
  identity: string
  capabilities: string[]
  constraints: string[]
}

export interface WakeUpMetrics {
  itemsIncluded: number
  itemsConsidered: number
  avgRetentionScore: number
  avgRrfScore: number
}

export interface WakeUpTokenCounts {
  L0: number
  L1: number
  total: number
  remaining: number
}

export interface WakeUpLayers {
  L0: string
  L1: string
  L2?: string
  L3?: string
}

export interface WakeUpResult {
  layers: WakeUpLayers
  tokenCounts: WakeUpTokenCounts
  metrics: WakeUpMetrics
}

/** Render the Layer-0 wake-up profile block (identity/context preamble). */
export function buildL0(profile: Layer0Profile): string {
  const lines: string[] = [
    `[L0] Identity: ${profile.identity}`,
    `[L0] Capabilities: ${profile.capabilities.join(', ')}`,
  ]
  if (profile.constraints.length > 0) {
    lines.push(`[L0] Constraints: ${profile.constraints.join('; ')}`)
  }
  return lines.join('\n')
}

/** Select the most salient Layer-1 memory items for the wake-up pack. */
export function selectL1Items(items: MemoryItem[], config: WakeUpConfig = DEFAULT_WAKEUP_CONFIG): MemoryItem[] {
  return items
    .map((item) => ({
      ...item,
      retentionScore: computeRetentionScore(item.score, item.ageDays, config.retentionConfig),
      rrfScore: computeRrfScore(
        { bm25Rank: item.bm25Rank, vectorRank: item.vectorRank, graphRank: item.graphRank },
        config.rrfConfig,
      ),
    }))
    .sort((a, b) => {
      const aCombined = (a.retentionScore ?? 0) * 0.5 + (a.rrfScore ?? 0) * 0.5
      const bCombined = (b.retentionScore ?? 0) * 0.5 + (b.rrfScore ?? 0) * 0.5
      return bCombined - aCombined
    })
    .slice(0, config.maxL1Items)
}

/** Render the Layer-1 memory block from selected items. */
export function buildL1(items: MemoryItem[]): string {
  return items
    .map((item) => {
      const tier: MemoryTier = classifyTier(item.retentionScore ?? 0)
      return `[L1:${tier}] ${item.content}`
    })
    .join('\n')
}

/** Render the Layer-2 block: items re-ranked against the query. */
export function buildL2(items: MemoryItem[], query: string): string {
  if (items.length === 0) return ''
  return items.map((item) => `[L2:on-demand:${query}] ${item.content}`).join('\n')
}

/** Render the Layer-3 block: deepest query-specific retrieval. */
export function buildL3(items: MemoryItem[], query: string): string {
  if (items.length === 0) return ''
  return items.map((item) => `[L3:deep:${query}] ${item.content}`).join('\n')
}

/** Assemble the full layered wake-up context (L0–L3) for a session. */
export function orchestrateWakeUp(
  profile: Layer0Profile,
  memoryItems: MemoryItem[],
  onDemandItems?: MemoryItem[],
  onDemandQuery?: string,
  deepSearchItems?: MemoryItem[],
  deepSearchQuery?: string,
  config: WakeUpConfig = DEFAULT_WAKEUP_CONFIG,
): WakeUpResult {
  const l0Content = buildL0(profile)
  let l0Tokens = estimateTokens(l0Content)

  if (l0Tokens > config.maxL0Tokens) {
    const ratio = config.maxL0Tokens / l0Tokens
    const truncated = l0Content
      .split('\n')
      .map((line) => line.slice(0, Math.floor(line.length * ratio)))
      .join('\n')
    l0Tokens = estimateTokens(truncated)
  }

  const l1Budget = config.budget - l0Tokens

  const l1Selected = selectL1Items(memoryItems, config)

  let l1Content = ''
  let l1Tokens = 0
  const includedItems: MemoryItem[] = []

  for (const item of l1Selected) {
    const itemText = `[L1:${classifyTier(item.retentionScore ?? 0)}] ${item.content}`
    const itemTokens = estimateTokens(itemText)
    if (l1Tokens + itemTokens > l1Budget && includedItems.length > 0) break
    l1Content += (l1Content ? '\n' : '') + itemText
    l1Tokens += itemTokens
    includedItems.push(item)
  }

  const l2Content = onDemandItems && onDemandQuery ? buildL2(onDemandItems, onDemandQuery) : ''
  const l3Content = deepSearchItems && deepSearchQuery ? buildL3(deepSearchItems, deepSearchQuery) : ''

  const totalTokens = l0Tokens + l1Tokens

  const avgRetention =
    includedItems.length > 0 ? includedItems.reduce((s, i) => s + (i.retentionScore ?? 0), 0) / includedItems.length : 0
  const avgRrf =
    includedItems.length > 0 ? includedItems.reduce((s, i) => s + (i.rrfScore ?? 0), 0) / includedItems.length : 0

  return {
    layers: {
      L0: l0Content,
      L1: l1Content,
      ...(l2Content ? { L2: l2Content } : {}),
      ...(l3Content ? { L3: l3Content } : {}),
    },
    tokenCounts: {
      L0: l0Tokens,
      L1: l1Tokens,
      total: totalTokens,
      remaining: Math.max(0, config.budget - totalTokens),
    },
    metrics: {
      itemsIncluded: includedItems.length,
      itemsConsidered: memoryItems.length,
      avgRetentionScore: avgRetention,
      avgRrfScore: avgRrf,
    },
  }
}
