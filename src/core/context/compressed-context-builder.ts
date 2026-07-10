/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Applies L2-L4 compression layers (truncation, default-omission, key-shortening)
 * on top of the TaskContext produced by task-context-builder.ts.
 * WHY: compression logic separated from assembly so each can evolve independently.
 * Composing: compact-context-types.ts (types + utils), task-context-builder.ts,
 * info-bottleneck.ts (opt-in gate), token-estimator.ts.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import type { TaskContext, CompressedContext } from './compact-context-types.js'
import {
  NEIGHBOR_DESC_LIMIT,
  COMPRESSED_DESC_LIMIT,
  COMPRESSED_AC_KEEP,
  COMPRESSED_AC_LIMIT_MAX,
  truncateDescription,
  compressKeys,
  omitDefaults,
} from './compact-context-types.js'
import { buildTaskContext } from './task-context-builder.js'
import { estimateTokens } from './token-estimator.js'
import { acceptTextCompression } from '../economy/info-bottleneck.js'
import { resolveInfoBottleneckGate, taskPredictiveText } from './info-bottleneck-gate.js'
import { buildGlossary, type CorpusEntry } from './glossary-builder.js'

/** Max tokens for the injected glossary card. */
const GLOSSARY_CARD_TOKEN_CAP = 200

/** Apply L2-L4 compression layers to task context. */
export function buildCompressedContext(
  store: SqliteStore,
  nodeId: string,
  options?: { full?: boolean },
): CompressedContext | null {
  const compact = buildTaskContext(store, nodeId)
  if (!compact) return null

  const l1Tokens = compact.metrics.estimatedTokens

  // Track which fields were truncated in this run
  const truncatedFields: string[] = []
  const truncatedReasons: Record<string, string> = {}

  // L2 — Neighbor Description Truncation + task-level budget enforcement
  // Task description: keep full when full=true; truncate to COMPRESSED_DESC_LIMIT otherwise.
  // Neighbors: always truncate to NEIGHBOR_DESC_LIMIT. Children: remove description.
  const l2Payload = structuredClone(compact) as TaskContext

  if (!options?.full) {
    // Task's own description — truncate if over budget
    const desc = l2Payload.task.description
    if (desc && desc.length > COMPRESSED_DESC_LIMIT) {
      const truncated = truncateDescription(desc, COMPRESSED_DESC_LIMIT)
      l2Payload.task.description = truncated
      if (l2Payload.node.description) {
        l2Payload.node.description = truncated
      }
      truncatedFields.push('description')
      truncatedReasons['description'] = `${desc.length} chars truncated to ${COMPRESSED_DESC_LIMIT}`
    }

    // AC list — keep first COMPRESSED_AC_KEEP when over COMPRESSED_AC_LIMIT_MAX
    const acList = l2Payload.acceptanceCriteria
    if (acList.length > COMPRESSED_AC_LIMIT_MAX) {
      const total = acList.length
      l2Payload.acceptanceCriteria = acList.slice(0, COMPRESSED_AC_KEEP)
      truncatedFields.push('acceptanceCriteria')
      truncatedReasons['acceptanceCriteria'] = `${COMPRESSED_AC_KEEP}/${total} included`
    }
  }

  if (l2Payload.parent?.description) {
    l2Payload.parent.description = truncateDescription(l2Payload.parent.description, NEIGHBOR_DESC_LIMIT)
  }
  for (const child of l2Payload.children) {
    delete child.description
  }
  if (l2Payload.relatedNodes) {
    for (const rel of l2Payload.relatedNodes) {
      rel.description = truncateDescription(rel.description, NEIGHBOR_DESC_LIMIT)
    }
  }
  if (l2Payload.edgeChildren) {
    for (const ec of l2Payload.edgeChildren) {
      delete ec.description
    }
  }
  // Information-Bottleneck gate (opt-in lever) — reject a lossy truncation whose
  // predictive-information cost outweighs its token savings, falling back to the
  // lossless full build. Default OFF ⇒ byte-identical legacy behaviour.
  if (!options?.full) {
    const gate = resolveInfoBottleneckGate(store)
    if (gate.on) {
      const before = taskPredictiveText(compact)
      const after = taskPredictiveText(l2Payload)
      if (!acceptTextCompression(before, after, { beta: gate.beta, estimateTokens })) {
        return buildCompressedContext(store, nodeId, { full: true })
      }
    }
  }

  // Remove metrics from serialization (internal field)
  const { metrics: _m, ...l2WithoutMetrics } = l2Payload
  const l2Tokens = estimateTokens(JSON.stringify(l2WithoutMetrics))

  // L3 — Default Omission (before key compression so keys are still original names)
  const l3Payload = omitDefaults(l2WithoutMetrics) as Record<string, unknown>
  const l3Tokens = estimateTokens(JSON.stringify(l3Payload))

  // L4 — Short Keys (final structural compression)
  const l4Payload = compressKeys(l3Payload) as Record<string, unknown>
  l4Payload['_k'] = 'see formulas.keyLegend'

  // Glossary card — inject domain terms within token cap (default only; omit when full=true)
  if (!options?.full) {
    const corpus: CorpusEntry[] = []
    if (compact.task.description) corpus.push({ text: compact.task.description, source: compact.task.title })
    for (const ac of compact.acceptanceCriteria) corpus.push({ text: ac, source: 'ac' })
    if (compact.parent?.description) corpus.push({ text: compact.parent.description, source: 'parent' })
    const entries = buildGlossary(corpus, { topN: 10 })
    if (entries.length > 0) {
      // Trim to token cap
      let glossaryStr = JSON.stringify(entries.map((e) => ({ t: e.term, d: e.definition })))
      while (estimateTokens(glossaryStr) > GLOSSARY_CARD_TOKEN_CAP && entries.length > 1) {
        entries.pop()
        glossaryStr = JSON.stringify(entries.map((e) => ({ t: e.term, d: e.definition })))
      }
      l4Payload['glossary'] = entries.map((e) => ({ t: e.term, d: e.definition }))
    }
  }

  const l4Tokens = estimateTokens(JSON.stringify(l4Payload))

  const totalReductionPercent = l1Tokens > 0 ? Math.round(((l1Tokens - l4Tokens) / l1Tokens) * 100) : 0

  return {
    payload: l4Payload,
    truncated: { fields: truncatedFields, reasons: truncatedReasons },
    layerMetrics: {
      l1Tokens,
      l2Tokens,
      l3Tokens,
      l4Tokens,
      totalReductionPercent,
    },
  }
}
