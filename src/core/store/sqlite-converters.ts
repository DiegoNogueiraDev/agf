/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * SQLite ↔ domain converters for the graph store.
 *
 * WHY here: extracted from sqlite-store.ts (was >1 700 lines) so each file
 * stays under 800 lines. All row-type definitions, serialization helpers, and
 * domain-mapping functions live here; SqliteStore imports them as pure utilities.
 *
 * Composing modules: node-mutations.ts and edge-mutations.ts import the row
 * types and converter functions; sqlite-store.ts imports the same for snapshot
 * restore and bulk-insert operations.
 */

import type { GraphNode, GraphEdge, GraphProject, NodeType, NodeStatus, SourceRef } from '../graph/graph-types.js'
import { createLogger } from '../utils/logger.js'
import { ValidationError } from '../utils/errors.js'

const log = createLogger({ layer: 'core', source: 'sqlite-converters.ts' })

// ── Shared mutation options ──────────────────────────────

/** Options for mutation operations (multi-agent support, ADR-10). */
export interface MutationOptions {
  agentId?: string
  expectedVersion?: number
  /** When true, bypasses enforcement hooks (status:pre-change, etc.). Use with --force. */
  skipHooks?: boolean
}

// ── Row types (SQLite ↔ JS) ──────────────────────────────

export interface ProjectRow {
  id: string
  name: string
  fs_path: string | null
  created_at: string
  updated_at: string
}

export interface NodeRow {
  id: string
  project_id: string
  type: string
  title: string
  description: string | null
  status: string
  priority: number
  xp_size: string | null
  estimate_minutes: number | null
  tags: string | null
  parent_id: string | null
  sprint: string | null
  source_file: string | null
  source_start_line: number | null
  source_end_line: number | null
  source_confidence: number | null
  acceptance_criteria: string | null
  test_files: string | null
  implementation_files: string | null
  blocked: number
  metadata: string | null
  evolution_reason: string | null
  evolution_count: number | null
  created_at: string
  updated_at: string
}

export interface EdgeRow {
  id: string
  project_id: string
  from_node: string
  to_node: string
  relation_type: string
  weight: number | null
  reason: string | null
  metadata: string | null
  created_at: string
}

// ── Metadata size limits ─────────────────────────────────

export const MAX_EDGE_METADATA_SIZE = 100_000
export const MAX_NODE_METADATA_SIZE = 100_000

// ── Active-row predicates ─────────────────────────────────

/**
 * SQL predicate matching only active (non-soft-deleted) nodes. Soft-delete sets
 * `archived = 1`; this is the single source of truth for "active rows" so every
 * node reader enforces the invariant the same way.
 */
export const ACTIVE_NODE_PREDICATE = '(archived = 0 OR archived IS NULL)'

/**
 * SQL fragment for edge readers: matches only edges whose BOTH endpoints are still
 * active. Correlated on the outer `edges` row; valid wherever the FROM table is `edges`.
 */
export const ACTIVE_EDGE_ENDPOINTS_PREDICATE =
  '(NOT EXISTS (SELECT 1 FROM nodes na WHERE na.id = edges.from_node AND na.project_id = edges.project_id AND na.archived = 1)' +
  ' AND NOT EXISTS (SELECT 1 FROM nodes nb WHERE nb.id = edges.to_node AND nb.project_id = edges.project_id AND nb.archived = 1))'

// ── Mapping helpers ──────────────────────────────────────

/** Safely serialize a value to JSON, replacing NaN/Infinity with null and catching circular refs. */
export function safeJsonStringify(value: unknown, field: string, nodeId: string): string | null {
  if (value === null || value === undefined) return null
  let hadNonFinite = false
  try {
    const resultValue = JSON.stringify(value, (_key, v) => {
      if (typeof v === 'number' && !Number.isFinite(v)) {
        hadNonFinite = true
        return null
      }
      return v
    })
    if (hadNonFinite) {
      log.warn('Non-finite number sanitized to null in node field', { nodeId, field })
    }
    return resultValue
  } catch (err) {
    log.warn('Failed to serialize node field', { nodeId, field, error: String(err) })
    throw new ValidationError(`Invalid JSON in field '${field}' for node '${nodeId}': ${String(err)}`, [
      { field, nodeId, error: String(err) },
    ])
  }
}

export function nodeToRow(node: GraphNode, projectId: string): NodeRow {
  return {
    id: node.id,
    project_id: projectId,
    type: node.type,
    title: node.title,
    description: node.description ?? null,
    status: node.status,
    priority: node.priority,
    xp_size: node.xpSize ?? null,
    estimate_minutes: node.estimateMinutes ?? null,
    tags: safeJsonStringify(node.tags, 'tags', node.id),
    parent_id: node.parentId ?? null,
    sprint: node.sprint ?? null,
    source_file: node.sourceRef?.file ?? null,
    source_start_line: node.sourceRef?.startLine ?? null,
    source_end_line: node.sourceRef?.endLine ?? null,
    source_confidence: node.sourceRef?.confidence ?? null,
    acceptance_criteria: safeJsonStringify(node.acceptanceCriteria, 'acceptanceCriteria', node.id),
    test_files: safeJsonStringify(node.testFiles, 'testFiles', node.id),
    implementation_files: safeJsonStringify(node.implementationFiles, 'implementationFiles', node.id),
    blocked: node.blocked ? 1 : 0,
    metadata: safeJsonStringify(node.metadata, 'metadata', node.id),
    evolution_reason: node.evolutionReason ?? null,
    evolution_count: node.evolutionCount ?? 0,
    created_at: node.createdAt,
    updated_at: node.updatedAt,
  }
}

export function rowToNode(row: NodeRow): GraphNode {
  const node: GraphNode = {
    id: row.id,
    type: row.type as NodeType,
    title: row.title,
    status: row.status as NodeStatus,
    priority: row.priority as 1 | 2 | 3 | 4 | 5,
    blocked: row.blocked === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  if (row.description) node.description = row.description
  if (row.xp_size) node.xpSize = row.xp_size as GraphNode['xpSize']
  if (row.estimate_minutes != null) node.estimateMinutes = row.estimate_minutes
  if (row.tags) {
    try {
      node.tags = JSON.parse(row.tags)
    } catch {
      log.warn('corrupt JSON in node field', { nodeId: row.id, field: 'tags' })
      node.tags = []
    }
  }
  if (row.parent_id) node.parentId = row.parent_id
  if (row.sprint) node.sprint = row.sprint
  if (row.acceptance_criteria) {
    try {
      node.acceptanceCriteria = JSON.parse(row.acceptance_criteria)
    } catch {
      log.warn('corrupt JSON in node field', { nodeId: row.id, field: 'acceptanceCriteria' })
      node.acceptanceCriteria = []
    }
  }
  if (row.test_files) {
    try {
      node.testFiles = JSON.parse(row.test_files)
    } catch {
      log.warn('corrupt JSON in node field', { nodeId: row.id, field: 'testFiles' })
      node.testFiles = []
    }
  }
  if (row.implementation_files) {
    try {
      node.implementationFiles = JSON.parse(row.implementation_files)
    } catch {
      log.warn('corrupt JSON in node field', { nodeId: row.id, field: 'implementationFiles' })
      node.implementationFiles = []
    }
  }
  if (row.metadata) {
    try {
      node.metadata = JSON.parse(row.metadata)
    } catch {
      log.warn('corrupt JSON in node field', { nodeId: row.id, field: 'metadata' })
      node.metadata = {}
    }
  }
  if (row.evolution_reason) node.evolutionReason = row.evolution_reason
  if (row.evolution_count !== null && row.evolution_count !== undefined && row.evolution_count > 0) {
    node.evolutionCount = row.evolution_count
  }

  if (row.source_file) {
    const ref: SourceRef = { file: row.source_file }
    if (row.source_start_line != null) ref.startLine = row.source_start_line
    if (row.source_end_line != null) ref.endLine = row.source_end_line
    if (row.source_confidence != null) ref.confidence = row.source_confidence
    node.sourceRef = ref
  }

  return node
}

export function edgeToRow(edge: GraphEdge, projectId: string): EdgeRow {
  // Bug #055: validate edge metadata JSON size + Bug #E1-T04: validate JSON
  let metadataJson: string | null = null
  if (edge.metadata) {
    let hadNonFinite = false
    try {
      metadataJson = JSON.stringify(edge.metadata, (_key, v) => {
        if (typeof v === 'number' && !Number.isFinite(v)) {
          hadNonFinite = true
          return null
        }
        return v
      })
    } catch (err) {
      log.warn('Failed to serialize edge metadata', { edgeId: edge.id, error: String(err) })
      throw new ValidationError(`Invalid JSON in field 'metadata' for edge '${edge.id}': ${String(err)}`, [
        { field: 'metadata', edgeId: edge.id, error: String(err) },
      ])
    }
    if (hadNonFinite) {
      log.warn('Non-finite number sanitized to null in edge metadata', { edgeId: edge.id })
    }
  }
  if (metadataJson && metadataJson.length > MAX_EDGE_METADATA_SIZE) {
    throw new ValidationError(
      `Edge metadata too large (${metadataJson.length} chars, max ${MAX_EDGE_METADATA_SIZE})`,
      [],
    )
  }
  return {
    id: edge.id,
    project_id: projectId,
    from_node: edge.from,
    to_node: edge.to,
    relation_type: edge.relationType,
    weight: edge.weight ?? null,
    reason: edge.reason ?? null,
    metadata: metadataJson,
    created_at: edge.createdAt,
  }
}

export function rowToEdge(row: EdgeRow): GraphEdge {
  const edge: GraphEdge = {
    id: row.id,
    from: row.from_node,
    to: row.to_node,
    relationType: row.relation_type as GraphEdge['relationType'],
    createdAt: row.created_at,
  }

  if (row.weight != null) edge.weight = row.weight
  if (row.reason) edge.reason = row.reason
  if (row.metadata) {
    try {
      edge.metadata = JSON.parse(row.metadata)
    } catch {
      log.warn(`[store] corrupted edge metadata — skipping (edge ${row.id ?? 'unknown'})`)
    }
  }

  return edge
}

export function rowToProject(row: ProjectRow): GraphProject {
  const project: GraphProject = {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
  if (row.fs_path) project.fsPath = row.fs_path
  return project
}
