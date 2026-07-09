/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-understand-anything-dashboard-bridge — Task 2.3
 *
 * Pure graph sanitization — no Zod, no React, no side effects.
 * Ported from vendor understand-anything `packages/core/src/schema.ts` approach.
 */

import type { GraphDocument, GraphNode, GraphEdge, NodeType, RelationType, NodeStatus, Priority } from './types'

// ── Alias maps ────────────────────────────────────────────────────────────────

/** Maps non-canonical node type strings to canonical NodeType values. */
export const NODE_TYPE_ALIASES: Record<string, NodeType> = {
  story: 'task',
  feature: 'epic',
  bug: 'task',
  chore: 'task',
  spike: 'task',
  item: 'task',
  'user-story': 'task',
  user_story: 'task',
}

/** Maps non-canonical edge relation strings to canonical RelationType values. */
export const EDGE_TYPE_ALIASES: Record<string, RelationType> = {
  'depends-on': 'depends_on',
  blocked_by: 'depends_on',
  'blocked-by': 'depends_on',
  'parent-of': 'parent_of',
  'child-of': 'child_of',
  'related-to': 'related_to',
  'priority-over': 'priority_over',
}

// ── Canonical sets ────────────────────────────────────────────────────────────

const CANONICAL_NODE_TYPES = new Set<string>([
  'epic',
  'task',
  'subtask',
  'requirement',
  'constraint',
  'milestone',
  'acceptance_criteria',
  'risk',
  'decision',
  'interface',
  'formula',
  'state_machine',
  'contract',
  'scenario',
  'performance_budget',
  'asset',
  'data_table',
  'metric',
  'config_schema',
])

const CANONICAL_EDGE_TYPES = new Set<string>([
  'parent_of',
  'child_of',
  'depends_on',
  'blocks',
  'related_to',
  'priority_over',
  'implements',
  'derived_from',
  'provides',
  'consumes',
  'requires_asset',
])

const CANONICAL_STATUSES = new Set<string>(['backlog', 'ready', 'in_progress', 'blocked', 'done'])

// ── AutoFix result ────────────────────────────────────────────────────────────

export interface AutoFixResult {
  graph: GraphDocument
  issues: string[]
  repairImpossible: boolean
  fatalFields: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveIdFromName(name: string): string {
  return (
    'auto-' +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 32)
  )
}

function normalizeNodeType(raw: unknown): NodeType {
  if (typeof raw !== 'string') return 'task'
  if (CANONICAL_NODE_TYPES.has(raw)) return raw as NodeType
  return (NODE_TYPE_ALIASES[raw] as NodeType | undefined) ?? 'task'
}

function normalizeEdgeType(raw: unknown): RelationType {
  if (typeof raw !== 'string') return 'related_to'
  if (CANONICAL_EDGE_TYPES.has(raw)) return raw as RelationType
  return (EDGE_TYPE_ALIASES[raw] as RelationType | undefined) ?? 'related_to'
}

function normalizeStatus(raw: unknown): NodeStatus {
  if (typeof raw === 'string' && CANONICAL_STATUSES.has(raw)) return raw as NodeStatus
  return 'backlog'
}

function normalizePriority(raw: unknown): Priority {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (n >= 1 && n <= 5 && Number.isInteger(n)) return n as Priority
  return 3
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// ── Node sanitizer ────────────────────────────────────────────────────────────

interface NodeRepairResult {
  node: GraphNode | null
  issues: string[]
  fatal: string | null
}

function repairNode(raw: Record<string, unknown>, index: number): NodeRepairResult {
  const issues: string[] = []

  // Resolve id
  let id = typeof raw['id'] === 'string' && raw['id'].length > 0 ? raw['id'] : null

  if (!id) {
    const name = raw['name'] ?? raw['title']
    if (typeof name === 'string' && name.length > 0) {
      id = deriveIdFromName(name)
      issues.push(`nodes[${index}].id missing — derived from name: "${id}"`)
    } else {
      return {
        node: null,
        issues: [],
        fatal: `nodes[${index}].id cannot be repaired — no id or name field`,
      }
    }
  }

  // Resolve title
  const title =
    typeof raw['title'] === 'string' && raw['title'].length > 0
      ? raw['title']
      : typeof raw['name'] === 'string' && raw['name'].length > 0
        ? raw['name']
        : id

  const node: GraphNode = {
    id,
    type: normalizeNodeType(raw['type']),
    title,
    status: normalizeStatus(raw['status']),
    priority: normalizePriority(raw['priority']),
    createdAt: typeof raw['createdAt'] === 'string' ? raw['createdAt'] : new Date().toISOString(),
    updatedAt: typeof raw['updatedAt'] === 'string' ? raw['updatedAt'] : new Date().toISOString(),
    ...(typeof raw['description'] === 'string' ? { description: raw['description'] } : {}),
    ...(typeof raw['parentId'] === 'string' || raw['parentId'] === null
      ? { parentId: raw['parentId'] as string | null }
      : {}),
    ...(raw['sprint'] != null ? { sprint: raw['sprint'] as string } : {}),
    ...(raw['xpSize'] != null ? { xpSize: raw['xpSize'] as GraphNode['xpSize'] } : {}),
    ...(Array.isArray(raw['tags']) ? { tags: raw['tags'] as string[] } : {}),
    ...(raw['metadata'] != null ? { metadata: raw['metadata'] as Record<string, unknown> } : {}),
    ...(raw['blocked'] != null ? { blocked: Boolean(raw['blocked']) } : {}),
  }

  return { node, issues, fatal: null }
}

// ── Edge sanitizer ────────────────────────────────────────────────────────────

function repairEdge(raw: Record<string, unknown>): GraphEdge {
  return {
    id: typeof raw['id'] === 'string' ? raw['id'] : `edge-${Math.random().toString(36).slice(2, 9)}`,
    from: typeof raw['from'] === 'string' ? raw['from'] : '',
    to: typeof raw['to'] === 'string' ? raw['to'] : '',
    relationType: normalizeEdgeType(raw['relationType'] ?? raw['type']),
    createdAt: typeof raw['createdAt'] === 'string' ? raw['createdAt'] : new Date().toISOString(),
    ...(typeof raw['weight'] === 'number' ? { weight: raw['weight'] } : {}),
    ...(typeof raw['reason'] === 'string' ? { reason: raw['reason'] } : {}),
    ...(raw['metadata'] != null ? { metadata: raw['metadata'] as Record<string, unknown> } : {}),
  }
}

// ── Main: autoFixGraph ────────────────────────────────────────────────────────

/**
 * Sanitizes and auto-repairs a raw unknown graph payload.
 * - Strips unknown fields (forward-compat via explicit field picking).
 * - Derives `id` from `name` if id is missing.
 * - Normalizes edge/node types via alias maps.
 * - Reports fatal fields for nodes that cannot be repaired.
 */
export function autoFixGraph(raw: unknown): AutoFixResult {
  const issues: string[] = []
  const fatalFields: string[] = []

  if (!isRecord(raw)) {
    return {
      graph: { nodes: [], edges: [] },
      issues: ['payload is not an object'],
      repairImpossible: true,
      fatalFields: ['root'],
    }
  }

  const rawNodes = Array.isArray(raw['nodes']) ? raw['nodes'] : []
  const rawEdges = Array.isArray(raw['edges']) ? raw['edges'] : []

  const nodes: GraphNode[] = []
  for (let i = 0; i < rawNodes.length; i++) {
    const rawNode = rawNodes[i]
    if (!isRecord(rawNode)) {
      fatalFields.push(`nodes[${i}] is not an object`)
      continue
    }
    const result = repairNode(rawNode, i)
    if (result.fatal) {
      fatalFields.push(result.fatal)
    } else if (result.node) {
      nodes.push(result.node)
      issues.push(...result.issues)
    }
  }

  const edges: GraphEdge[] = rawEdges
    .filter((e: unknown): e is Record<string, unknown> => isRecord(e))
    .map((e: Record<string, unknown>) => repairEdge(e))

  return {
    graph: { nodes, edges },
    issues,
    repairImpossible: fatalFields.length > 0,
    fatalFields,
  }
}
