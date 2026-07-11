/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * task-feature-extractor — extracts RL routing features from graph task nodes.
 *
 * WHY: RL-based task-aware routing needs a stable, lightweight feature vector
 * per task (type, complexity, blast radius, external deps). Extracted here so
 * the router can consume features without re-parsing nodes each time.
 *
 * Composing: graph-types.GraphNode → extractTaskFeatures → storeTaskFeatures
 *   → SqliteStore.updateNode(metadata.taskFeatures) → RL router reads metadata.
 */

import type { GraphNode } from '../graph/graph-types.js'
import type { SqliteStore } from '../store/sqlite-store.js'

/** Task type classification for RL routing. */
export type TaskType = 'implement' | 'review' | 'decompose'

/** Feature vector extracted from a task node. */
export interface TaskFeatures {
  taskType: TaskType
  acCount: number
  blastRadius: number
  hasExternalDeps: boolean
}

const REVIEW_RE = /\b(review|audit|inspect|assess)\b/i
const DECOMPOSE_RE = /\b(decompose|decomposition|split|breakdown|break.?down|plan)\b/i
const EXTERNAL_TAGS = new Set(['external', 'api', 'integration', 'http', 'webhook', 'third-party'])
const EXTERNAL_DESC_RE = /\b(external|api|http|fetch|webhook|third.?party|integration)\b/i

const BLAST_BY_SIZE: Record<string, number> = { XS: 1, S: 1, M: 2, L: 3, XL: 4 }

/** Classify the task type from its title. */
function classifyType(title: string): TaskType {
  if (REVIEW_RE.test(title)) return 'review'
  if (DECOMPOSE_RE.test(title)) return 'decompose'
  return 'implement'
}

/**
 * Extract the RL feature vector from a task node.
 * Pure function — reads the node, returns features, zero side effects.
 */
export function extractTaskFeatures(node: GraphNode): TaskFeatures {
  const taskType = classifyType(node.title)
  const acCount = node.acceptanceCriteria?.length ?? 0
  const blastRadius = BLAST_BY_SIZE[node.xpSize ?? ''] ?? 1

  const tagHit = (node.tags ?? []).some((t) => EXTERNAL_TAGS.has(t.toLowerCase()))
  const descHit = EXTERNAL_DESC_RE.test(node.description ?? '')
  const hasExternalDeps = tagHit || descHit

  return { taskType, acCount, blastRadius, hasExternalDeps }
}

/**
 * Persist the extracted features into the node's metadata.
 * Returns the updated node, or null if the node was not found.
 */
export function storeTaskFeatures(store: SqliteStore, nodeId: string, features: TaskFeatures): GraphNode | null {
  return store.updateNode(nodeId, {
    metadata: { taskFeatures: features },
  })
}
