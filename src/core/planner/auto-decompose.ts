/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Auto-decomposition for the PLAN → IMPLEMENT handoff.
 *
 * `smartDecompose` only *computes* a decomposition — it does not touch the
 * store. This module provides the write-side:
 *
 *   - `persistDecomposition(store, result)` inserts the subtask nodes and
 *     `depends_on` edges that `smartDecompose` returned.
 *   - `autoDecomposeLarge(store, opts?)` scans the current graph for L/XL
 *     tasks that are good candidates (no existing children, 2–N ACs, not
 *     already decomposed) and applies persistDecomposition to each.
 *
 * Guardrails (why opt-in is the default in `plan_sprint`):
 *   - Only L/XL, because M/S are already Haiku-eligible.
 *   - Skip parents that already have children — the user (or a previous
 *     decompose pass) made a choice we should not override.
 *   - Require ≥ 2 ACs — one AC = nothing to split.
 *   - Cap subtasks per parent (`maxSubtasks`, default 8) to prevent runaway
 *     fragmentation of AC-heavy epics.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import type { GraphNode, GraphEdge } from '../graph/graph-types.js'
import { XP_SIZE_ORDER } from '../utils/xp-sizing.js'
import { generateId } from '../utils/id.js'
import { smartDecompose, type DecomposeResult } from './smart-decompose.js'
import { createLogger } from '../utils/logger.js'
import { now } from '../utils/time.js'

const log = createLogger({ layer: 'core', source: 'auto-decompose.ts' })

export interface PersistResult {
  createdNodeIds: string[]
  createdEdgeCount: number
}

/**
 * Insert subtasks + `depends_on` edges into the store. The order follows
 * `result.subtasks`; edges follow `result.edges` but are remapped from the
 * planner's provisional IDs to the IDs we actually allocate on write.
 */
export function persistDecomposition(store: SqliteStore, result: DecomposeResult): PersistResult {
  const createdNodeIds: string[] = []

  result.subtasks.forEach((sub) => {
    const realId = generateId('sub')
    createdNodeIds.push(realId)

    const timestamp = now()
    const node: GraphNode = {
      id: realId,
      type: 'subtask',
      title: sub.title,
      status: 'backlog',
      priority: 3,
      parentId: result.parentId,
      acceptanceCriteria: sub.acceptanceCriteria,
      estimateMinutes: sub.estimateMinutes,
      createdAt: timestamp,
      updatedAt: timestamp,
    } as GraphNode

    store.insertNode(node)
  })

  // AUDIT-005: `smartDecompose` emits a sequential chain where edge[i] links
  // subtask[i+1] → subtask[i] (each subtask depends on the previous one). The
  // previous reconstruction derived a planner→real id map from a `Set` over the
  // edge endpoints, which discarded subtask order and so reversed / mis-targeted
  // the `depends_on` edges. Rebuild edges positionally from the freshly created
  // subtask ids (mirrors smart-decompose's own persist at smart-decompose.ts).
  let createdEdgeCount = 0
  for (let i = 0; i < result.edges.length && i < createdNodeIds.length - 1; i++) {
    const from = createdNodeIds[i + 1]
    const to = createdNodeIds[i]
    const realEdge: GraphEdge = {
      id: generateId('edge'),
      from,
      to,
      relationType: 'depends_on',
      createdAt: now(),
    } as GraphEdge
    try {
      store.insertEdge(realEdge)
      createdEdgeCount++
    } catch (err) {
      log.warn('auto-decompose:edge_insert_failed', {
        from,
        to,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  log.info('auto-decompose:persisted', {
    parentId: result.parentId,
    subtasks: createdNodeIds.length,
    edges: createdEdgeCount,
  })

  return { createdNodeIds, createdEdgeCount }
}

export type SkipReason = 'not_large' | 'has_children' | 'insufficient_acs' | 'too_many_acs' | 'decompose_failed'

export interface AutoDecomposeReport {
  /** Parents that were successfully decomposed. */
  decomposed: Array<{ parentId: string; subtaskIds: string[] }>
  /** Candidates that were inspected but intentionally skipped. */
  skipped: Array<{ parentId: string; reason: SkipReason }>
}

export interface AutoDecomposeOptions {
  /** Maximum subtasks to create per parent. Default 8. */
  maxSubtasks?: number
  /** Minimum ACs required on the parent before we will split. Default 2. */
  minAcs?: number
}

const LARGE_XP_THRESHOLD = 4 // L + XL

/**
 * Scan the store for decomposition candidates and persist subtasks for each
 * that passes the guardrails.
 */
export function autoDecomposeLarge(store: SqliteStore, options: AutoDecomposeOptions = {}): AutoDecomposeReport {
  const maxSubtasks = options.maxSubtasks ?? 8
  const minAcs = options.minAcs ?? 2

  const doc = store.toGraphDocument()
  const decomposed: AutoDecomposeReport['decomposed'] = []
  const skipped: AutoDecomposeReport['skipped'] = []

  for (const node of doc.nodes) {
    if (node.type !== 'task') continue

    const ord = XP_SIZE_ORDER[node.xpSize ?? ''] ?? 0
    if (ord < LARGE_XP_THRESHOLD) {
      // M/S/XS silently — they are not candidates, don't clutter the report.
      continue
    }

    const hasChildren = doc.nodes.some((n) => n.parentId === node.id)
    if (hasChildren) {
      skipped.push({ parentId: node.id, reason: 'has_children' })
      continue
    }

    const acChildren = doc.nodes.filter((n) => n.type === 'acceptance_criteria' && n.parentId === node.id)
    const acCount = (node.acceptanceCriteria?.length ?? 0) + acChildren.length
    if (acCount < minAcs) {
      skipped.push({ parentId: node.id, reason: 'insufficient_acs' })
      continue
    }
    if (acCount > maxSubtasks) {
      skipped.push({ parentId: node.id, reason: 'too_many_acs' })
      continue
    }

    const resultValue = smartDecompose(store, node.id)
    if (!resultValue) {
      skipped.push({ parentId: node.id, reason: 'decompose_failed' })
      continue
    }

    const persisted = persistDecomposition(store, resultValue)
    decomposed.push({ parentId: node.id, subtaskIds: persisted.createdNodeIds })
  }

  log.info('auto-decompose:scan_complete', {
    decomposed: decomposed.length,
    skipped: skipped.length,
  })

  return { decomposed, skipped }
}
