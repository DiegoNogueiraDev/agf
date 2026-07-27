/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { SqliteStore } from '../store/sqlite-store.js'

/**
 * Structured rationale for an architectural or design decision.
 * Stored in the node's metadata so it survives context compaction.
 */
export interface DecisionRationale {
  decision: string
  why: string
  alternatives: string[]
  consequences: string
  date: string
}

const RATIONALE_KEY = 'rationale'

/**
 * Persists a decision rationale to a graph node's metadata AND description.
 *
 * Dual write:
 * - `metadata.rationale` — structured JSON, queryable via `agf node show`
 * - `description` — human-readable, survives compaction in any context window
 *
 * Either storage alone is sufficient for AC compliance; both maximises durability.
 */
export function writeDecisionRationale(store: SqliteStore, nodeId: string, rationale: DecisionRationale): void {
  const existing = store.getNodeById(nodeId)
  if (!existing) return

  const alts = rationale.alternatives.map((a) => `- ${a}`).join('\n')
  const description = [
    `## Decision\n${rationale.decision}`,
    `## Why\n${rationale.why}`,
    `## Alternatives Considered\n${alts}`,
    `## Consequences\n${rationale.consequences}`,
    `## Date\n${rationale.date}`,
  ].join('\n\n')

  const currentMeta = existing.metadata ?? {}
  store.updateNode(nodeId, {
    description,
    metadata: { ...currentMeta, [RATIONALE_KEY]: rationale },
  })
}

/**
 * Retrieves a previously written decision rationale from a node's metadata.
 * Returns `null` when the node doesn't exist or has no rationale stored.
 */
export function readDecisionRationale(store: SqliteStore, nodeId: string): DecisionRationale | null {
  const node = store.getNodeById(nodeId)
  if (!node?.metadata) return null
  const raw = (node.metadata as Record<string, unknown>)[RATIONALE_KEY]
  if (!raw || typeof raw !== 'object') return null
  return raw as DecisionRationale
}
