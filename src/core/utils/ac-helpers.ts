/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * AC (Acceptance Criteria) helpers — centralized utility for gathering AC
 * from both inline fields and child acceptance_criteria nodes.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { SqliteStore } from '../store/sqlite-store.js'

/**
 * Get all AC texts for a node — prefers inline AC, falls back to child AC node titles.
 */
// Bug #096: cache index for O(1) lookups when called in loops
let _cachedDocRef: WeakRef<GraphDocument> | null = null
let _nodeMap: Map<string, GraphDocument['nodes'][number]> = new Map()
let _acByParent: Map<string, string[]> = new Map()

function ensureAcIndex(doc: GraphDocument): void {
  if (_cachedDocRef?.deref() === doc) return
  _cachedDocRef = new WeakRef(doc)
  _nodeMap = new Map(doc.nodes.map((n) => [n.id, n]))
  _acByParent = new Map()
  for (const nVar of doc.nodes) {
    if (nVar.type === 'acceptance_criteria' && nVar.parentId) {
      const list = _acByParent.get(nVar.parentId) ?? []
      list.push(nVar.title)
      _acByParent.set(nVar.parentId, list)
    }
  }
}

/** Retrieve acceptance criteria texts for a node, falling back to parent AC nodes. */
export function getNodeAcTexts(doc: GraphDocument, nodeId: string): string[] {
  ensureAcIndex(doc)
  const node = _nodeMap.get(nodeId)
  if (!node) return []

  const inline = node.acceptanceCriteria ?? []
  if (inline.length > 0) return inline

  return _acByParent.get(nodeId) ?? []
}

/**
 * Get all AC texts for a node using store queries (no full graph scan).
 * Prefers inline AC, falls back to child AC node titles.
 */
export function getNodeAcFromStore(store: SqliteStore, nodeId: string): string[] {
  const node = store.getNodeById(nodeId)
  if (!node) return []

  const inline = node.acceptanceCriteria ?? []
  if (inline.length > 0) return inline

  return store
    .getChildNodes(nodeId)
    .filter((n) => n.type === 'acceptance_criteria')
    .map((n) => n.title)
}

/**
 * Check if a node has any AC — either inline or via child AC nodes.
 */
export function nodeHasAc(doc: GraphDocument, nodeId: string): boolean {
  return getNodeAcTexts(doc, nodeId).length > 0
}
