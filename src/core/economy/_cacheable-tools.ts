/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Allowlist of MCP tool names whose responses may be cached.
 * Only read-only tools are eligible — mutating tools (node, edge, update_status…)
 * must NOT appear here: the type system enforces this at compile-time by
 * constraining CacheableToolName to a union of known read-only names.
 */
export type CacheableToolName =
  | 'list'
  | 'show'
  | 'search'
  | 'metrics'
  | 'export'
  | 'context'
  | 'knowledge'
  | 'analyze'
  | 'snapshot'
  | 'next'
  | 'list_memories'
  | 'read_memory'
  | 'manage_skill'
  | 'plan_sprint'
  | 'validate'
  | 'code_intelligence'
  | 'journey'
  | 'query_graph'
  | 'help'
  | 'graph_health'
  | 'forecast'
  | 'kanban'

export const CACHEABLE_TOOLS = new Set<CacheableToolName>([
  'list',
  'show',
  'search',
  'metrics',
  'analyze',
  'knowledge',
  'query_graph',
  'help',
  'graph_health',
  'forecast',
  'kanban',
  'export',
  'context',
  'snapshot',
  'next',
  'list_memories',
  'read_memory',
  'manage_skill',
  'plan_sprint',
  'validate',
  'code_intelligence',
  'journey',
])
