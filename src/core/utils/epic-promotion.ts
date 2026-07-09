/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Epic promotion utilities:
 * - checkEpicPromotion: advisory suggestion (existing)
 * - autoPromoteEpic: executes promotion + recursive cascade up
 * - cascadeDownOnDone: marks AC/subtask children as done when parent is done
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { createLogger } from './logger.js'

const log = createLogger({ layer: 'core', source: 'epic-promotion.ts' })

export interface EpicPromotionResult {
  parentId: string
  parentTitle: string
  childrenDone: number
  suggestion: string
}

export interface AutoPromoteResult {
  /** IDs of nodes that were promoted to done */
  promoted: string[]
}

export interface CascadeDownResult {
  /** IDs of children that were cascaded to done */
  cascaded: string[]
}

const MAX_PROMOTE_DEPTH = 10

/**
 * Check if all children of a node's parent are done.
 * Returns a promotion suggestion if so, null otherwise.
 * Advisory only — does NOT change status.
 */
export function checkEpicPromotion(store: SqliteStore, nodeId: string): EpicPromotionResult | null {
  try {
    const node = store.getNodeById(nodeId)
    if (!node?.parentId) return null

    const siblings = store.getChildNodes(node.parentId)
    const allDone = siblings.length > 0 && siblings.every((s) => s.status === 'done')
    if (!allDone) return null

    const parent = store.getNodeById(node.parentId)
    if (!parent || parent.status === 'done') return null

    return {
      parentId: parent.id,
      parentTitle: parent.title,
      childrenDone: siblings.length,
      suggestion: `Todas as ${siblings.length} tasks filhas estão done. Considere marcar "${parent.title}" (${parent.id}) como done.`,
    }
  } catch (err) {
    log.debug('epic-promotion:check_failed', { error: String(err) })
    return null
  }
}

/**
 * Auto-promote parent epic to done when all children are done.
 * Recursively checks grandparent, great-grandparent, etc. up to MAX_PROMOTE_DEPTH.
 */
export function autoPromoteEpic(store: SqliteStore, nodeId: string, depth: number = 0): AutoPromoteResult {
  const resultValue: AutoPromoteResult = { promoted: [] }

  if (depth >= MAX_PROMOTE_DEPTH) return resultValue

  try {
    const node = store.getNodeById(nodeId)
    if (!node?.parentId) return resultValue

    const parent = store.getNodeById(node.parentId)
    if (!parent || parent.status === 'done') return resultValue

    const siblings = store.getChildNodes(parent.id)
    const allDone = siblings.length > 0 && siblings.every((s) => s.status === 'done')
    if (!allDone) return resultValue

    // Promote parent to done
    store.updateNodeStatus(parent.id, 'done')
    resultValue.promoted.push(parent.id)
    log.info('epic-promotion:auto_promoted', {
      nodeId: parent.id,
      title: parent.title,
      childrenDone: siblings.length,
      depth,
    })

    // Recurse up — maybe grandparent is now promotable
    const parentResult = autoPromoteEpic(store, parent.id, depth + 1)
    resultValue.promoted.push(...parentResult.promoted)
  } catch (err) {
    log.debug('epic-promotion:auto_promote_failed', { error: String(err) })
  }

  return resultValue
}

/**
 * Cascade done status DOWN to AC and subtask children.
 * Only cascades to acceptance_criteria and subtask types.
 * Does NOT cascade to task/epic children (those require explicit completion).
 */
export function cascadeDownOnDone(store: SqliteStore, nodeId: string): CascadeDownResult {
  const resultValue: CascadeDownResult = { cascaded: [] }

  try {
    const node = store.getNodeById(nodeId)
    if (!node || node.status !== 'done') return resultValue

    const children = store.getChildNodes(nodeId)
    const cascadeTypes = new Set(['acceptance_criteria', 'subtask'])

    for (const child of children) {
      if (cascadeTypes.has(child.type) && child.status !== 'done') {
        store.updateNodeStatus(child.id, 'done')
        resultValue.cascaded.push(child.id)
      }
    }

    if (resultValue.cascaded.length > 0) {
      log.info('epic-promotion:cascade_down', {
        parentId: nodeId,
        cascadedCount: resultValue.cascaded.length,
      })
    }
  } catch (err) {
    log.debug('epic-promotion:cascade_down_failed', { error: String(err) })
  }

  return resultValue
}
