/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Decomposition AC-coverage verifier (M2). When a task is split into subtasks,
 * every acceptance criterion of the parent must be represented by at least one
 * child — otherwise an AC is silently dropped. Deterministic, zero-token.
 *
 * Matching tolerates rephrasing (children restate parent ACs in their own
 * words): a parent AC is "covered" when a single child AC shares ≥60% of its
 * significant tokens. Exact wording is NOT required — that would be too brittle
 * and noisy. The gap is `recommended` so the driver keeps the final say.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import { getNodeAcTexts } from '../utils/ac-helpers.js'

const TASK_TYPES = new Set(['task', 'subtask'])
const COVERAGE_TOKEN_RATIO = 0.6

/** Short connective words (len ≥ 4) that carry no AC meaning. */
const STOPWORDS = new Set([
  'that',
  'this',
  'with',
  'from',
  'have',
  'will',
  'shall',
  'when',
  'then',
  'than',
  'into',
  'para',
  'deve',
  'será',
  'pelo',
  'pela',
  'como',
  'cada',
])

/** Significant tokens (len ≥ 4, non-stopword) of an AC, normalized. */
export function significantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents for robust matching
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
}

/** A parent AC is covered if a single child AC shares ≥60% of its tokens. */
function isCovered(parentAc: string, childAcs: string[]): boolean {
  const pTokens = new Set(significantTokens(parentAc))
  if (pTokens.size === 0) return true // can't evaluate → don't flag
  for (const child of childAcs) {
    const cSet = new Set(significantTokens(child))
    let hits = 0
    for (const t of pTokens) if (cSet.has(t)) hits++
    if (hits / pTokens.size >= COVERAGE_TOKEN_RATIO) return true
  }
  return false
}

export interface AcCoverageResult {
  parentId: string
  parentAcs: string[]
  uncoveredAcs: string[]
  /** % of parent ACs covered by ≥1 child (100 when the parent has no AC). */
  coverage: number
}

/** Verify every AC of a decomposed parent is covered by ≥1 child. Deterministic. */
export function verifyAcCoverage(doc: GraphDocument, parentId: string): AcCoverageResult {
  const parentAcs = getNodeAcTexts(doc, parentId)
  const children = doc.nodes.filter((n) => n.parentId === parentId && TASK_TYPES.has(n.type))
  const childAcs = children.flatMap((c) => getNodeAcTexts(doc, c.id))
  const uncoveredAcs = parentAcs.filter((ac) => !isCovered(ac, childAcs))
  const coverage =
    parentAcs.length === 0 ? 100 : Math.round(((parentAcs.length - uncoveredAcs.length) / parentAcs.length) * 100)
  return { parentId, parentAcs, uncoveredAcs, coverage }
}

/** IDs of tasks/subtasks that have task/subtask children (i.e. were decomposed). */
export function decomposedParents(doc: GraphDocument): string[] {
  const parentIds = new Set(
    doc.nodes.filter((n) => TASK_TYPES.has(n.type) && n.parentId).map((n) => n.parentId as string),
  )
  return doc.nodes.filter((n) => TASK_TYPES.has(n.type) && parentIds.has(n.id)).map((n) => n.id)
}
