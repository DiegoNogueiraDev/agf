/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 agentmemory contributors
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from agentmemory (https://github.com/rohitg00/agentmemory), Apache-2.0.
 * See THIRD-PARTY-NOTICES.md.
 */

export const DEFAULT_RRF_K = 60

export const DEFAULT_RRF_WEIGHTS = {
  bm25: 1 / 3,
  vector: 1 / 3,
  graph: 1 / 3,
}

export interface RankInput {
  bm25Rank: number
  vectorRank: number
  graphRank: number
}

export interface RrfConfig {
  k: number
  weights: {
    bm25: number
    vector: number
    graph: number
  }
}

/** Compute Reciprocal Rank Fusion (RRF) score for a document across multiple ranked lists. */
export function computeRrfScore(
  input: RankInput,
  config: RrfConfig = { k: DEFAULT_RRF_K, weights: DEFAULT_RRF_WEIGHTS },
): number {
  let score = 0

  if (input.bm25Rank > 0) {
    score += config.weights.bm25 * (1 / (config.k + input.bm25Rank))
  }
  if (input.vectorRank > 0) {
    score += config.weights.vector * (1 / (config.k + input.vectorRank))
  }
  if (input.graphRank > 0) {
    score += config.weights.graph * (1 / (config.k + input.graphRank))
  }

  return score
}
