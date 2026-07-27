/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { NodeType, NodeStatus, RelationType } from './types'

export const NODE_TYPE_COLORS: Record<NodeType, string> = {
  epic: '#7c3aed',
  task: '#2196f3',
  subtask: '#10b981',
  requirement: '#f59e0b',
  constraint: '#ef4444',
  milestone: '#8b5cf6',
  acceptance_criteria: '#06b6d4',
  risk: '#f97316',
  decision: '#ec4899',
  // Game-specific / advanced node types
  interface: '#14b8a6',
  formula: '#a855f7',
  state_machine: '#6366f1',
  contract: '#0ea5e9',
  scenario: '#22c55e',
  performance_budget: '#eab308',
  asset: '#f472b6',
  data_table: '#64748b',
  metric: '#fb923c',
  config_schema: '#84cc16',
}

export const STATUS_COLORS: Record<NodeStatus, string> = {
  done: '#4caf50',
  in_progress: '#2196f3',
  blocked: '#f44336',
  ready: '#ff9800',
  backlog: '#9e9e9e',
}

export const STATUS_LABELS: Record<NodeStatus, string> = {
  done: 'Done',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  ready: 'Ready',
  backlog: 'Backlog',
}

export const EDGE_STYLES: Record<RelationType, { color: string; dashed: boolean; label: string }> = {
  depends_on: { color: '#6c757d', dashed: false, label: 'depends on' },
  blocks: { color: '#f44336', dashed: true, label: 'blocks' },
  parent_of: { color: '#7c3aed', dashed: false, label: 'parent of' },
  child_of: { color: '#10b981', dashed: false, label: 'child of' },
  related_to: { color: '#9e9e9e', dashed: true, label: 'related to' },
  priority_over: { color: '#ff9800', dashed: true, label: 'priority over' },
  implements: { color: '#2196f3', dashed: false, label: 'implements' },
  derived_from: { color: '#06b6d4', dashed: true, label: 'derived from' },
  // Game-specific / advanced relation types
  provides: { color: '#22c55e', dashed: false, label: 'provides' },
  consumes: { color: '#f97316', dashed: false, label: 'consumes' },
  requires_asset: { color: '#f472b6', dashed: true, label: 'requires asset' },
}

/** Default fallback color for unknown node types or statuses. Centralised here so no component hardcodes a hex. */
export const FALLBACK_COLOR = '#6b7280'

export const ALL_STATUSES: NodeStatus[] = ['backlog', 'ready', 'in_progress', 'blocked', 'done']
export const ALL_TYPES: NodeType[] = [
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
]

// ── Lifecycle Phases ──────────────────────────────

export const LIFECYCLE_PHASES = [
  'ANALYZE',
  'DESIGN',
  'PLAN',
  'IMPLEMENT',
  'VALIDATE',
  'REVIEW',
  'HANDOFF',
  'DEPLOY',
  'LISTENING',
] as const

export const PHASE_COLORS: Record<string, string> = {
  ANALYZE: '#8b5cf6',
  DESIGN: '#3b82f6',
  PLAN: '#06b6d4',
  IMPLEMENT: '#10b981',
  VALIDATE: '#f59e0b',
  REVIEW: '#ef4444',
  HANDOFF: '#ec4899',
  DEPLOY: '#f97316',
  LISTENING: '#6b7280',
}

// ── Code Graph ─────────────────────────────────

export const CODE_SYMBOL_COLORS: Record<string, string> = {
  function: '#4fc3f7',
  class: '#ce93d8',
  method: '#81c784',
  interface: '#4dd0e1',
  variable: '#ffd54f',
  module: '#b39ddb',
  file: '#90a4ae',
  folder: '#78909c',
  // Multi-language symbol kinds
  struct: '#ef9a9a',
  enum: '#ffcc80',
  trait: '#a5d6a7',
  property: '#80deea',
  constant: '#ffe082',
  package: '#c5e1a5',
  annotation: '#f48fb1',
  macro: '#ffab91',
  type_alias: '#b0bec5',
  constructor: '#9fa8da',
  field: '#bcaaa4',
  delegate: '#80cbc4',
  event: '#ce93d8',
  namespace: '#b39ddb',
}

export const CODE_RELATION_COLORS: Record<string, string> = {
  belongs_to: '#546e7a',
  imports: '#546e7a',
  calls: '#4fc3f7',
  extends: '#81c784',
  implements: '#4dd0e1',
  // Multi-language relation types
  exports: '#66bb6a',
  uses: '#78909c',
  overrides: '#ffb74d',
  decorates: '#f48fb1',
}

export const CODE_RELATION_LABELS: Record<string, string> = {
  belongs_to: 'Contains',
  imports: 'Imports',
  calls: 'Calls',
  extends: 'Extends',
  implements: 'Implements',
  // Multi-language
  exports: 'Exports',
  uses: 'Uses',
  overrides: 'Overrides',
  decorates: 'Decorates',
}

export const LANGUAGE_COLORS: Record<string, string> = {
  typescript: '#3178c6',
  javascript: '#f7df1e',
  python: '#3776ab',
  go: '#00add8',
  rust: '#dea584',
  java: '#ed8b00',
  csharp: '#68217a',
  c: '#a8b9cc',
  cpp: '#00599c',
  ruby: '#cc342d',
  php: '#777bb4',
  kotlin: '#7f52ff',
  swift: '#fa7343',
  lua: '#000080',
}

// ── Siebel ─────────────────────────────────

export const SIEBEL_TYPE_COLORS: Record<string, string> = {
  screen: '#8b5cf6',
  view: '#3b82f6',
  applet: '#06b6d4',
  business_object: '#7c3aed',
  business_component: '#10b981',
  business_service: '#f59e0b',
  workflow: '#ef4444',
  table: '#78909c',
  integration_object: '#ec4899',
  web_template: '#6b7280',
  pick_list: '#a78bfa',
  field: '#94a3b8',
  link: '#64748b',
  column: '#94a3b8',
  control: '#94a3b8',
  list_column: '#94a3b8',
  menu_item: '#94a3b8',
  project: '#d97706',
}

export const SIEBEL_RELATION_STYLES: Record<string, { color: string; dashed: boolean; label: string }> = {
  uses: { color: '#2196f3', dashed: false, label: 'uses' },
  references: { color: '#6c757d', dashed: true, label: 'references' },
  contains: { color: '#7c3aed', dashed: false, label: 'contains' },
  extends: { color: '#10b981', dashed: true, label: 'extends' },
  based_on: { color: '#f59e0b', dashed: false, label: 'based on' },
  linked_to: { color: '#ef4444', dashed: true, label: 'linked to' },
  parent_of: { color: '#8b5cf6', dashed: false, label: 'parent of' },
}
