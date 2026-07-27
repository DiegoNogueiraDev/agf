/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Deterministic Layer Classification — maps every MCP tool to a deterministic layer.
 * Layer 0 (SQL): pure data retrieval
 * Layer 1 (Cache): session/semantic caching
 * Layer 2 (Heuristic): FSM/decision trees
 * Layer 3 (Property-Based): invariant checks (DoD, DoR, validation)
 * Layer 4 (Meta-Rule): learning from AI decisions
 */

export type DeterministicLayer = 'L0_SQL' | 'L1_Cache' | 'L2_Heuristic' | 'L3_PropertyBased' | 'L4_MetaRule'

export interface ToolClassification {
  toolName: string
  layer: DeterministicLayer
  rationale: string
}

const CLASSIFICATIONS: ToolClassification[] = [
  // L0 — Pure SQL / direct data retrieval
  { toolName: 'list', layer: 'L0_SQL', rationale: 'Direct SQL SELECT with filters' },
  { toolName: 'show', layer: 'L0_SQL', rationale: 'Direct node lookup by ID' },
  { toolName: 'search', layer: 'L0_SQL', rationale: 'FTS5 BM25 search over nodes' },
  { toolName: 'metrics', layer: 'L0_SQL', rationale: 'Aggregate SQL queries (COUNT, AVG)' },
  { toolName: 'export', layer: 'L0_SQL', rationale: 'Serialize graph document to JSON/Mermaid' },
  { toolName: 'snapshot', layer: 'L0_SQL', rationale: 'Direct snapshot read/write' },
  {
    toolName: 'knowledge',
    layer: 'L0_SQL',
    rationale: 'Knowledge stats, export, feedback, prune, reindex (consolidated)',
  },
  { toolName: 'list_memories', layer: 'L0_SQL', rationale: 'Read memory file listing' },
  { toolName: 'read_memory', layer: 'L0_SQL', rationale: 'Read memory file content' },
  { toolName: 'edge', layer: 'L0_SQL', rationale: 'CRUD on edge table' },
  { toolName: 'node', layer: 'L0_SQL', rationale: 'CRUD on node table' },
  { toolName: 'init', layer: 'L0_SQL', rationale: 'Create project in DB' },
  { toolName: 'import_graph', layer: 'L0_SQL', rationale: 'Merge JSON into DB' },
  { toolName: 'import_prd', layer: 'L0_SQL', rationale: 'Parse file and insert nodes' },
  { toolName: 'move_node', layer: 'L0_SQL', rationale: 'Update parentId + edges' },
  { toolName: 'clone_node', layer: 'L0_SQL', rationale: 'Copy node + edges' },
  { toolName: 'update_status', layer: 'L0_SQL', rationale: 'Update status field in DB' },
  { toolName: 'template', layer: 'L0_SQL', rationale: 'CRUD on task templates' },
  { toolName: 'journey', layer: 'L0_SQL', rationale: 'CRUD on journey store' },
  { toolName: 'delete_memory', layer: 'L0_SQL', rationale: 'Delete memory file' },
  { toolName: 'sync_stack_docs', layer: 'L0_SQL', rationale: 'Fetch and cache library docs' },

  // L1 — Cache / Memoization
  {
    toolName: 'context',
    layer: 'L1_Cache',
    rationale: 'Compact context, RAG retrieval, compression (consolidated with session/semantic cache)',
  },

  // L2 — Heuristics / FSM / Decision Trees
  { toolName: 'next', layer: 'L2_Heuristic', rationale: 'Priority + dependency FSM for task selection' },
  { toolName: 'analyze', layer: 'L2_Heuristic', rationale: '44 deterministic analyze modes' },
  { toolName: 'plan_sprint', layer: 'L2_Heuristic', rationale: 'Velocity-based sprint planning heuristic' },
  { toolName: 'set_phase', layer: 'L2_Heuristic', rationale: 'Lifecycle state machine transition' },
  { toolName: 'forecast', layer: 'L2_Heuristic', rationale: 'DORA metrics calculation from historical data' },
  { toolName: 'kanban', layer: 'L2_Heuristic', rationale: 'WIP limits and flow state machine' },
  { toolName: 'graph_health', layer: 'L2_Heuristic', rationale: 'Multi-analyzer scan composition' },
  { toolName: 'help', layer: 'L2_Heuristic', rationale: 'Topic-based help routing' },
  { toolName: 'manage_skill', layer: 'L2_Heuristic', rationale: 'Skill CRUD + phase-based recommendation' },
  { toolName: 'code_intelligence', layer: 'L2_Heuristic', rationale: 'AST analysis + symbol graph traversal' },

  // L3 — Property-Based / Invariant Checks
  { toolName: 'validate', layer: 'L3_PropertyBased', rationale: 'AC quality scoring + browser validation invariants' },
  {
    toolName: 'finish_task',
    layer: 'L3_PropertyBased',
    rationale: 'DoD 9 checks — property-based invariant validation',
  },
  { toolName: 'start_task', layer: 'L3_PropertyBased', rationale: 'Dependency satisfaction + TDD hints' },

  // L4 — Meta-Rule Learning
  { toolName: 'write_memory', layer: 'L4_MetaRule', rationale: 'Persist AI decisions as reusable rules' },

  // Translation tools (L0 — deterministic AST transforms, consolidated)
  { toolName: 'translate', layer: 'L0_SQL', rationale: 'AST-based code translation, analysis, and job management' },

  // DaVinci tools (L0 — deterministic parsing/generation, consolidated)
  { toolName: 'davinci', layer: 'L0_SQL', rationale: 'JS AST analysis, code conversion, and build (consolidated)' },

  // Siebel CRM tools (L0 — SIF parsing/generation, consolidated)
  {
    toolName: 'siebel',
    layer: 'L0_SQL',
    rationale: 'SIF import/export, analysis, composition, validation, search (consolidated)',
  },
]

/**
 * Get the deterministic layer classification for all MCP tools.
 */
export function classifyTools(): ToolClassification[] {
  return [...CLASSIFICATIONS]
}

/**
 * Get distribution of tools across deterministic layers.
 */
export function getLayerDistribution(): Record<DeterministicLayer, number> {
  const dist: Record<DeterministicLayer, number> = {
    L0_SQL: 0,
    L1_Cache: 0,
    L2_Heuristic: 0,
    L3_PropertyBased: 0,
    L4_MetaRule: 0,
  }
  for (const cVar of CLASSIFICATIONS) {
    dist[cVar.layer]++
  }
  return dist
}

/**
 * Get classification for a specific tool.
 */
export function getToolLayer(toolName: string): ToolClassification | undefined {
  return CLASSIFICATIONS.find((c) => c.toolName === toolName)
}
