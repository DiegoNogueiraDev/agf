/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Computes token savings across all compression layers for a given node.
 * WHY: metrics computation separated from the builders so it can be used
 * independently in the economy pipeline. Composing: neighborhood-builder.ts,
 * compressed-context-builder.ts, token-estimator.ts.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import type { LayeredTokenMetrics } from './compact-context-types.js'
import { estimateTokens } from './token-estimator.js'
import { buildNaiveNeighborhood } from './neighborhood-builder.js'
import { buildCompressedContext } from './compressed-context-builder.js'

/** Compute token savings across all compression layers. */
export function computeLayeredMetrics(store: SqliteStore, nodeId: string): LayeredTokenMetrics | null {
  const node = store.getNodeById(nodeId)
  if (!node) return null

  const naiveNodeTokens = estimateTokens(JSON.stringify(node))

  const naive = buildNaiveNeighborhood(store, nodeId)
  if (!naive) return null
  const naiveNeighborhoodTokens = naive.estimatedTokens

  const compressed = buildCompressedContext(store, nodeId)
  if (!compressed) return null

  const compactContextTokens = compressed.layerMetrics.l1Tokens
  const neighborTruncatedTokens = compressed.layerMetrics.l2Tokens
  const defaultOmittedTokens = compressed.layerMetrics.l3Tokens
  const shortKeysTokens = compressed.layerMetrics.l4Tokens

  const summaryPayload = {
    id: node.id,
    type: node.type,
    title: node.title,
    status: node.status,
    priority: node.priority,
  }
  const summaryTierTokens = estimateTokens(JSON.stringify(summaryPayload))

  const layer1Savings = naiveNeighborhoodTokens - compactContextTokens
  const layer2Savings = compactContextTokens - neighborTruncatedTokens
  const layer3Savings = neighborTruncatedTokens - defaultOmittedTokens
  const layer4Savings = defaultOmittedTokens - shortKeysTokens
  const totalRealSavings = naiveNeighborhoodTokens - summaryTierTokens
  const totalRealSavingsPercent =
    naiveNeighborhoodTokens > 0 ? Math.round((totalRealSavings / naiveNeighborhoodTokens) * 100) : 0

  return {
    naiveNodeTokens,
    naiveNeighborhoodTokens,
    compactContextTokens,
    neighborTruncatedTokens,
    shortKeysTokens,
    defaultOmittedTokens,
    summaryTierTokens,
    layer1Savings,
    layer2Savings,
    layer3Savings,
    layer4Savings,
    totalRealSavings,
    totalRealSavingsPercent,
  }
}
