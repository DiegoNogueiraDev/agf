/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Touched-files helpers — pure utilities for the multi-agent WIP gate.
 *
 * These functions operate on `metadata.touchedFiles` stored on graph nodes
 * so the WIP gate can detect file-level conflicts between in-flight tasks
 * without scanning the working tree.
 */

import type { GraphNode } from '../graph/graph-types.js'
import type { LockManager } from '../store/lock-manager.js'
import type { SqliteStore } from '../store/sqlite-store.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'touched-files.ts' })

const TOUCHED_FILES_CAP = 20

/**
 * Extract `metadata.touchedFiles` from a node with full type safety.
 * Returns an empty array when the field is absent or malformed.
 * Caps the result at {@link TOUCHED_FILES_CAP} entries and warns if truncated.
 */
export function getTouchedFiles(node: GraphNode): string[] {
  const raw = (node.metadata as Record<string, unknown> | undefined)?.touchedFiles

  if (!Array.isArray(raw)) {
    return []
  }

  const strings = raw.filter((entry): entry is string => typeof entry === 'string')

  if (strings.length > TOUCHED_FILES_CAP) {
    log.warn('touched-files:cap_exceeded', {
      nodeId: node.id,
      count: String(strings.length),
      cap: String(TOUCHED_FILES_CAP),
    })
    return strings.slice(0, TOUCHED_FILES_CAP)
  }

  return strings
}

/**
 * Returns the intersection of two file arrays.
 * Pure function — no side effects.
 */
export function haveFileOverlap(a: string[], b: string[]): string[] {
  const setB = new Set(b)
  return a.filter((f) => setB.has(f))
}

/**
 * Builds a map of { nodeId → Set<touchedFile> } for all currently in-flight
 * tasks (i.e. tasks whose `task:{nodeId}` lock is active).
 *
 * Used by the WIP gate to detect file conflicts before accepting a new task.
 */
export function getInFlightFileMap(store: SqliteStore, lockManager: LockManager): Map<string, Set<string>> {
  const resultValue = new Map<string, Set<string>>()

  for (const lock of lockManager.listActive()) {
    if (!lock.resourceId.startsWith('task:')) {
      continue
    }

    const nodeId = lock.resourceId.slice('task:'.length)
    const node = store.getNodeById(nodeId)

    if (!node) {
      log.warn('touched-files:node_not_found', { nodeId, agentId: lock.agentId })
      continue
    }

    resultValue.set(nodeId, new Set(getTouchedFiles(node)))
  }

  return resultValue
}
