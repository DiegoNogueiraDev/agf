/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export type NodeType =
  | 'epic'
  | 'task'
  | 'subtask'
  | 'requirement'
  | 'constraint'
  | 'milestone'
  | 'acceptance_criteria'
  | 'risk'
  | 'decision'
  // Game-specific / advanced node types
  | 'interface'
  | 'formula'
  | 'state_machine'
  | 'contract'
  | 'scenario'
  | 'performance_budget'
  | 'asset'
  | 'data_table'
  | 'metric'
  | 'config_schema'
  // Spec-driven development types
  | 'constitution'
  // Journey execution
  | 'journey_run'
  // Browser harness execution nodes
  | 'browser_test'

export type NodeStatus = 'backlog' | 'ready' | 'in_progress' | 'blocked' | 'done' | 'quarantined' | 'satisfied'

export type XpSize = 'XS' | 'S' | 'M' | 'L' | 'XL'

export type RelationType =
  | 'parent_of'
  | 'child_of'
  | 'depends_on'
  | 'blocks'
  | 'related_to'
  | 'priority_over'
  | 'implements'
  | 'derived_from'
  // Game-specific / advanced relation types
  | 'provides'
  | 'consumes'
  | 'requires_asset'
  // Decomposition
  | 'decomposed_into'
  // Browser-test evidence edges (§EPIC-browser-harness Task 4.2)
  | 'tests'
  | 'validates_adr'
  | 'mirrors_unit'

export interface SourceRef {
  file: string
  startLine?: number
  endLine?: number
  confidence?: number
}

export interface GraphNode {
  id: string
  type: NodeType
  title: string
  description?: string
  status: NodeStatus
  priority: 1 | 2 | 3 | 4 | 5
  xpSize?: XpSize
  estimateMinutes?: number
  tags?: string[]
  parentId?: string | null
  sprint?: string | null
  sourceRef?: SourceRef
  acceptanceCriteria?: string[]
  testFiles?: string[]
  /** Source files this task delivers — the code axis of the AC↔code↔test triangulation. */
  implementationFiles?: string[]
  blocked?: boolean
  metadata?: {
    inferred?: boolean
    origin?: string
    [key: string]: unknown
  }
  /**
   * §extracta — Why this node was last regenerated. Null/undefined for
   * nodes that have never been regenerated. Set by `node update` when the
   * caller passes `evolutionReason`. Drives analyze(evolution_audit).
   */
  evolutionReason?: string | null
  /**
   * §extracta — Cumulative count of regenerations. Incremented every time
   * `node update` is called with a non-null `evolutionReason`.
   */
  evolutionCount?: number
  createdAt: string
  updatedAt: string
}

export interface GraphEdge {
  id: string
  from: string
  to: string
  relationType: RelationType
  weight?: number
  reason?: string
  metadata?: {
    inferred?: boolean
    confidence?: number
    [key: string]: unknown
  }
  createdAt: string
}

export interface GraphIndexes {
  byId: Record<string, number>
  childrenByParent: Record<string, string[]>
  incomingByNode: Record<string, string[]>
  outgoingByNode: Record<string, string[]>
}

export interface GraphProject {
  id: string
  name: string
  fsPath?: string
  createdAt: string
  updatedAt: string
}

export interface GraphMeta {
  sourceFiles: string[]
  lastImport: string | null
}

export interface GraphDocument {
  version: string
  project: GraphProject
  nodes: GraphNode[]
  edges: GraphEdge[]
  indexes: GraphIndexes
  meta: GraphMeta
}
