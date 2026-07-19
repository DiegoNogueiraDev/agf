/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * graph-snapshot — pure builder for GET /api/graph (web dashboard, GraphSnapshot CT2).
 *
 * WHY: the dashboard renders the project graph. This module is PURE (store +
 * filters in → snapshot out) so the route stays thin. It REUSES
 * store.toGraphDocument() and maps ONLY the 6 light node fields — never leaking
 * heavy description/metadata (token economy). Default scope excludes 'done' and
 * caps at 300 nodes. Imitates the /api/session-events wiring in progress-server.ts.
 */
import type { SqliteStore } from '../store/sqlite-store.js'

export const DEFAULT_LIMIT = 300

/** Light node projection — only the 6 fields the view needs. */
export interface GraphSnapshotNode {
  id: string
  type: string
  title: string
  status: string
  parentId: string | null
  priority: number
}

export interface GraphSnapshotEdge {
  from: string
  to: string
  relationType: string
}

export interface GraphSnapshot {
  nodes: GraphSnapshotNode[]
  edges: GraphSnapshotEdge[]
  /** Number of in-scope nodes BEFORE the limit was applied. */
  total: number
  truncated: boolean
}

export interface GraphSnapshotFilters {
  /** Status allow-list. Omitted → every status except 'done'. */
  status?: string[]
  /** Type allow-list. Omitted → every type. */
  type?: string[]
  /** Max nodes returned (default 300). */
  limit?: number
  /** Restrict to a node and its descendants. */
  rootId?: string
}

/** Build a scoped/filtered graph snapshot, mapping only the light node fields. */
export function buildGraphSnapshot(store: SqliteStore, filters: GraphSnapshotFilters = {}): GraphSnapshot {
  const doc = store.toGraphDocument()
  const limit = filters.limit ?? DEFAULT_LIMIT
  const statusAllow = filters.status && filters.status.length > 0 ? new Set(filters.status) : null
  const typeAllow = filters.type && filters.type.length > 0 ? new Set(filters.type) : null
  const subtree = filters.rootId ? collectSubtree(doc.nodes, filters.rootId) : null

  const scoped = doc.nodes.filter((node) => {
    if (statusAllow) {
      if (!statusAllow.has(node.status)) return false
    } else if (node.status === 'done') {
      return false
    }
    if (typeAllow && !typeAllow.has(node.type)) return false
    if (subtree && !subtree.has(node.id)) return false
    return true
  })

  const total = scoped.length
  const limited = scoped.slice(0, limit)
  const keptIds = new Set(limited.map((node) => node.id))

  const nodes: GraphSnapshotNode[] = limited.map((node) => ({
    id: node.id,
    type: node.type,
    title: node.title,
    status: node.status,
    parentId: node.parentId ?? null,
    priority: node.priority,
  }))

  const edges: GraphSnapshotEdge[] = doc.edges
    .filter((edge) => keptIds.has(edge.from) && keptIds.has(edge.to))
    .map((edge) => ({ from: edge.from, to: edge.to, relationType: edge.relationType }))

  return { nodes, edges, total, truncated: total > limit }
}

/** Collect rootId plus all transitive children via parentId links. */
function collectSubtree(nodes: ReadonlyArray<{ id: string; parentId?: string | null }>, rootId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>()
  for (const node of nodes) {
    if (!node.parentId) continue
    const siblings = childrenByParent.get(node.parentId) ?? []
    siblings.push(node.id)
    childrenByParent.set(node.parentId, siblings)
  }

  const collected = new Set<string>([rootId])
  const stack = [rootId]
  while (stack.length > 0) {
    const current = stack.pop() as string
    for (const child of childrenByParent.get(current) ?? []) {
      if (!collected.has(child)) {
        collected.add(child)
        stack.push(child)
      }
    }
  }
  return collected
}

/** Parse a CSV query param (`a,b,c`) into a trimmed string list (empty → undefined). */
export function parseCsvParam(raw: string | null): string[] | undefined {
  if (!raw) return undefined
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts : undefined
}
