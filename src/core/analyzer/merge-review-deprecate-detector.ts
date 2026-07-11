/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * MRD Detector — identifies graph nodes that are candidates for merge, review, or deprecation.
 *
 * Uses only data already present in the graph (no external APIs, no embeddings).
 *
 * Merge: Jaccard title similarity >= 0.7 among non-done nodes of the same type.
 * Review: stale in_progress, blocked-by-done, high-priority stale backlog, missing AC.
 * Deprecate: tagged deprecated/obsolete, orphan nodes (no parent + no edges + not done).
 */

import type { GraphDocument, GraphNode } from '../graph/graph-types.js'
import { tokenize, jaccardSimilarity } from '../utils/similarity.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'merge-review-deprecate-detector.ts' })

// ── Constants ──

const MERGE_SIMILARITY_THRESHOLD = 0.7
const STALE_IN_PROGRESS_DAYS = 7
const HIGH_PRIORITY_STALE_DAYS = 30
const DEPRECATE_TAGS = new Set(['deprecated', 'obsolete'])

// ── Types ──

export interface MergeCandidatePair {
  nodeA: string
  nodeB: string
  titleA: string
  titleB: string
  similarity: number
  sameParent: boolean
  sameType: boolean
}

export type ReviewReason = 'stale_in_progress' | 'blocked_by_done' | 'high_priority_stale' | 'missing_ac_critical'

export interface ReviewCandidate {
  nodeId: string
  title: string
  reason: ReviewReason
  details: string
}

export type DeprecateReason = 'tagged_deprecated' | 'orphan_no_edges'

export interface DeprecateCandidate {
  nodeId: string
  title: string
  reason: DeprecateReason
  details: string
}

export interface MrdCandidateReport {
  merge: MergeCandidatePair[]
  review: ReviewCandidate[]
  deprecate: DeprecateCandidate[]
  totalCandidates: number
}

// ── Helpers ──

function daysSince(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24)
}

function hasEdges(nodeId: string, doc: GraphDocument): boolean {
  return doc.edges.some((e) => e.from === nodeId || e.to === nodeId)
}

// ── Merge Detection ──

function detectMergeCandidates(doc: GraphDocument): MergeCandidatePair[] {
  const candidates: MergeCandidatePair[] = []
  const activeNodes = doc.nodes.filter((n) => n.status !== 'done')

  // Group by type for O(n²) within type
  const byType = new Map<string, GraphNode[]>()
  for (const node of activeNodes) {
    const group = byType.get(node.type) ?? []
    group.push(node)
    byType.set(node.type, group)
  }

  const reported = new Set<string>()

  for (const [, group] of byType) {
    for (let i = 0; i < group.length; i++) {
      const aVar = group[i]
      if (!aVar) continue
      const tokA = new Set(tokenize(aVar.title))
      if (tokA.size === 0) continue

      for (let j = i + 1; j < group.length; j++) {
        const bVar = group[j]
        if (!bVar) continue
        const tokB = new Set(tokenize(bVar.title))
        if (tokB.size === 0) continue

        const sim = jaccardSimilarity(tokA, tokB)
        if (sim < MERGE_SIMILARITY_THRESHOLD) continue

        const key = aVar.id < bVar.id ? `${aVar.id}|${bVar.id}` : `${bVar.id}|${aVar.id}`
        if (reported.has(key)) continue
        reported.add(key)

        candidates.push({
          nodeA: aVar.id,
          nodeB: bVar.id,
          titleA: aVar.title,
          titleB: bVar.title,
          similarity: Math.round(sim * 100) / 100,
          sameParent: !!(aVar.parentId && bVar.parentId && aVar.parentId === bVar.parentId),
          sameType: aVar.type === bVar.type,
        })
      }
    }
  }

  return candidates
}

// ── Review Detection ──

function detectReviewCandidates(doc: GraphDocument): ReviewCandidate[] {
  const candidates: ReviewCandidate[] = []
  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]))

  for (const node of doc.nodes) {
    // 1. Stale in_progress (not updated in >7 days)
    if (node.status === 'in_progress' && daysSince(node.updatedAt) > STALE_IN_PROGRESS_DAYS) {
      candidates.push({
        nodeId: node.id,
        title: node.title,
        reason: 'stale_in_progress',
        details: `In progress for ${Math.floor(daysSince(node.updatedAt))} days without update`,
      })
    }

    // 2. Blocked but all depends_on blockers are done
    if (node.blocked === true && node.status === 'blocked') {
      const blockers = doc.edges.filter((e) => e.from === node.id && e.relationType === 'depends_on')
      const allBlockersDone = blockers.length > 0 && blockers.every((e) => nodeById.get(e.to)?.status === 'done')
      if (allBlockersDone) {
        candidates.push({
          nodeId: node.id,
          title: node.title,
          reason: 'blocked_by_done',
          details: `Marked blocked but all ${blockers.length} blocker(s) are done — unblock and resume`,
        })
      }
    }

    // 3. High-priority (1-2) stale in backlog >30 days
    if (node.status === 'backlog' && node.priority <= 2 && daysSince(node.createdAt) > HIGH_PRIORITY_STALE_DAYS) {
      candidates.push({
        nodeId: node.id,
        title: node.title,
        reason: 'high_priority_stale',
        details: `Priority ${node.priority} task in backlog for ${Math.floor(daysSince(node.createdAt))} days`,
      })
    }

    // 4. Task/subtask missing acceptance criteria
    if ((node.type === 'task' || node.type === 'subtask') && node.status !== 'done') {
      const hasAc = node.acceptanceCriteria && node.acceptanceCriteria.length > 0
      if (!hasAc) {
        candidates.push({
          nodeId: node.id,
          title: node.title,
          reason: 'missing_ac_critical',
          details: `${node.type} has no acceptance criteria — add ACs before implementation`,
        })
      }
    }
  }

  return candidates
}

// ── Deprecate Detection ──

function detectDeprecateCandidates(doc: GraphDocument): DeprecateCandidate[] {
  const candidates: DeprecateCandidate[] = []

  for (const node of doc.nodes) {
    // 1. Explicitly tagged deprecated/obsolete
    if (node.tags?.some((t) => DEPRECATE_TAGS.has(t.toLowerCase()))) {
      candidates.push({
        nodeId: node.id,
        title: node.title,
        reason: 'tagged_deprecated',
        details: `Tagged as ${node.tags?.find((t) => DEPRECATE_TAGS.has(t.toLowerCase()))} — candidate for removal`,
      })
      continue
    }

    // 2. Orphan: no parentId, no edges, not done
    if (!node.parentId && node.status !== 'done' && !hasEdges(node.id, doc)) {
      candidates.push({
        nodeId: node.id,
        title: node.title,
        reason: 'orphan_no_edges',
        details: `No parent, no edges, status=${node.status} — isolated node with no connections`,
      })
    }
  }

  return candidates
}

// ── Main Export ──

/** Identify merge, review, and deprecate candidates using existing graph data. */
export function detectMrdCandidates(doc: GraphDocument): MrdCandidateReport {
  const merge = detectMergeCandidates(doc)
  const review = detectReviewCandidates(doc)
  const deprecate = detectDeprecateCandidates(doc)
  const totalCandidates = merge.length + review.length + deprecate.length

  log.info('mrd-detector', {
    merge: merge.length,
    review: review.length,
    deprecate: deprecate.length,
    totalCandidates,
  })

  return { merge, review, deprecate, totalCandidates }
}
