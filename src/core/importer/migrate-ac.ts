/*!
 * migrate-ac — one-shot migration: collapses legacy acceptance_criteria child nodes
 * into their parent task's ac[] field and soft-archives the node.
 *
 * WHY: import-prd now populates ac[] directly (prd-to-graph.ts), but existing graphs
 * created before that fix may have acceptance_criteria child nodes. This migrator
 * folds them in without data loss and archives the now-redundant node.
 * Default is dry-run — pass { commit: true } to apply.
 *
 * Composes with: prd-to-graph.ts (fixed source), sqlite-store.ts (updateNode, deleteNode).
 */

import type { SqliteStore } from '../store/sqlite-store.js'

export interface MigrateAcOptions {
  /** When false (default), only reports what would migrate without mutating. */
  commit: boolean
}

export type MalformedReason = 'orphan' | 'nested_ac' | 'dangling_ref' | 'unsupported_parent_type'

export interface MalformedAcDetail {
  id: string
  title: string
  reason: MalformedReason
}

export interface MigrateAcResult {
  /** Nodes that would be migrated in dry-run mode. */
  wouldMigrate: number
  /** Nodes actually migrated (0 in dry-run). */
  migrated: number
  /** Total AC criteria count before migration (field + node titles). */
  beforeCount: number
  /** Total AC criteria count after migration (field only). */
  afterCount: number
  /** Malformed AC nodes archived without folding (wrong parent type or no parent). */
  malformed: number
  /**
   * Per-node detail (id/title/reason) for every malformed node — a bare count
   * gives no way to know WHICH criteria text was archived without folding.
   */
  malformedDetails: MalformedAcDetail[]
}

/**
 * Find acceptance_criteria child nodes whose parent is a task/subtask,
 * fold each title into parent.acceptanceCriteria, and soft-delete the node.
 * Idempotent: skips titles already present in the parent's ac[].
 */
/** Parent types that accept AC criteria — AC nodes with these parents are folded in. */
const FOLDABLE_PARENT_TYPES = new Set(['task', 'subtask', 'epic'])

export function migrateAcNodes(store: SqliteStore, opts: MigrateAcOptions): MigrateAcResult {
  const doc = store.toGraphDocument()
  const acNodes = doc.nodes.filter((n) => n.type === 'acceptance_criteria')
  const acNodeIds = new Set(acNodes.map((n) => n.id))

  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]))
  const foldableIds = new Set(doc.nodes.filter((n) => FOLDABLE_PARENT_TYPES.has(n.type)).map((n) => n.id))

  const classifyMalformed = (n: (typeof acNodes)[number]): MalformedReason | null => {
    if (!n.parentId) return 'orphan'
    if (acNodeIds.has(n.parentId)) return 'nested_ac'
    if (!nodeById.has(n.parentId)) return 'dangling_ref'
    if (!foldableIds.has(n.parentId)) return 'unsupported_parent_type'
    return null
  }

  const eligible = acNodes.filter((n) => n.parentId && foldableIds.has(n.parentId))
  const malformedNodes = acNodes.filter((n) => classifyMalformed(n) !== null)
  const malformedDetails: MalformedAcDetail[] = malformedNodes.map((n) => ({
    id: n.id,
    title: n.title,
    reason: classifyMalformed(n) as MalformedReason,
  }))

  // Compute beforeCount: field entries + node count (eligible only)
  let beforeCount = eligible.length
  for (const n of eligible) {
    const parent = nodeById.get(n.parentId!)!
    beforeCount += (parent.acceptanceCriteria ?? []).length
  }

  const wouldMigrate = eligible.length

  if (!opts.commit) {
    return {
      wouldMigrate,
      migrated: 0,
      beforeCount,
      afterCount: beforeCount,
      malformed: malformedNodes.length,
      malformedDetails,
    }
  }

  let migrated = 0
  const patchedParents = new Map<string, string[]>()

  for (const acNode of eligible) {
    const parentId = acNode.parentId!
    const current = patchedParents.get(parentId) ?? store.getNodeById(parentId)?.acceptanceCriteria ?? []

    // Idempotency: skip if title already present
    if (!current.includes(acNode.title)) {
      patchedParents.set(parentId, [...current, acNode.title])
    } else {
      patchedParents.set(parentId, current)
    }

    store.deleteNode(acNode.id)
    migrated++
  }

  // Archive malformed AC nodes (soft-delete) without folding
  for (const acNode of malformedNodes) {
    store.deleteNode(acNode.id)
  }

  // Flush updated ac[] for each parent
  for (const [parentId, ac] of patchedParents) {
    store.updateNode(parentId, { acceptanceCriteria: ac })
  }

  // afterCount = sum of final ac[] lengths for all patched parents
  let afterCount = 0
  for (const ac of patchedParents.values()) {
    afterCount += ac.length
  }

  return { wouldMigrate, migrated, beforeCount, afterCount, malformed: malformedNodes.length, malformedDetails }
}
