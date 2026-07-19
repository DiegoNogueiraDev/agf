/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Client-side types for the agf web dashboard. Scoped to what the two tabs (Graph,
 * Economy) actually consume — the graph model and the EconomySnapshot contract.
 * Mirrors the backend schemas; the API route is the runtime source of truth.
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

export type NodeStatus = 'backlog' | 'ready' | 'in_progress' | 'blocked' | 'done'

export type XpSize = 'XS' | 'S' | 'M' | 'L' | 'XL'

export type Priority = 1 | 2 | 3 | 4 | 5

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
  priority: Priority
  xpSize?: XpSize
  estimateMinutes?: number
  tags?: string[]
  parentId?: string | null
  sprint?: string | null
  sourceRef?: SourceRef
  acceptanceCriteria?: string[]
  blocked?: boolean
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

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

export interface GraphEdge {
  id: string
  from: string
  to: string
  relationType: RelationType
  weight?: number
  reason?: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface GraphDocument {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface GraphStats {
  totalNodes: number
  byStatus: Record<NodeStatus, number>
  byType: Record<NodeType, number>
}

// ── Colony ────────────────────────────────────────────────────────────────────
// Mirror of the /api/v1/colony contract (node_c8b85a2b9c29; src/api/routes/colony.ts).

/** Raw pheromone trail row as stored (no decay applied). */
export interface ColonyTrail {
  key: string
  amount: number
  ts: number
}

/** Payload of GET /api/v1/colony. */
export interface ColonyData {
  trails: ColonyTrail[]
  entropy: { hNorm: number; band: 'stagnant' | 'healthy' | 'diffuse' | 'unknown' }
  health?: Record<string, unknown>
}

// ── Token Economy ─────────────────────────────────────────────────────────────
// Mirror of the backend EconomySnapshot contract (src/core/web/economy-snapshot.ts).

/** Per-lever savings row (economy_lever_ledger aggregate). */
export interface LeverSummary {
  lever: string
  totalSaved: number
  count: number
}

/** Aggregate token/cost totals shown at the top of the economy view. */
export interface EconomyTotals {
  tokensIn: number
  tokensOut: number
  /** cached_input_tokens sum (cheaper prefix-cache hits). */
  cache: number
  saved: number
  /** Dollar value of the saved tokens at current pricing. */
  savedUsd: number
  costUsd: number
}

/** Delegate-first economy: compact agf output vs the agent reading the raw graph. */
export interface DelegateEconomyView {
  cmdCalls: number
  cmdTok: number
  baselineTok: number
  /** Bounded counterfactual bytes (one full read × active days) — the honest "raw graph avoided". */
  baselineBytes: number
  delegateSaved: number
  savedPct: number
  avgTokPerCmd: number
  baselineExtrapolated: boolean
}

/** Local prefix-cache economy. */
export interface CacheEconomyView {
  hitRate: number
  totalHits: number
  totalMisses: number
  tokensSaved: number
  estimatedSavingsUsd: number
}

/** agf CLI command usage by the external agent. */
export interface CommandEconomyView {
  calls: number
  estimatedTokens: number
  graphExportBytes: number
  avgDurationMs: number
}

/** Per-command savings row (mirrors ProofCommandRow, proof-snapshot.ts). */
export interface ByCommandRow {
  command: string
  count: number
  savedTokens: number
  /** Percent, 0–100. */
  savingsRate: number
  avgMs: number
  lowSavings: boolean
  impact: 'low' | 'high'
}

/** RAG-OUT scaffold reuse (mirrors ProofScaffoldReuse, proof-snapshot.ts). */
export interface ScaffoldReuseView {
  recovered: number
  generated: number
  tokensSaved: number
  /** Percent-as-ratio, 0–1. */
  savingsRatio: number
}

/** Exact shape returned by GET /api/v1/economy. */
export interface EconomySnapshot {
  totals: EconomyTotals
  /** Savings rate as a percent, 0–100. */
  savingsRate: number
  levers: LeverSummary[]
  delegate: DelegateEconomyView | null
  cache: CacheEconomyView
  commands: CommandEconomyView
  byCommand: ByCommandRow[]
  scaffoldReuse: ScaffoldReuseView
}

/** One certainty pillar as returned by GET /api/v1/certainty/:nodeId. */
export interface CertaintyPillarView {
  key: string
  kind: 'hard' | 'soft'
  state: 'green' | 'red' | 'na'
  source: string
  detail: string
  rationale: string
}

/** Exact shape returned by GET /api/v1/certainty/:nodeId — the delivery verdict. */
export interface DeliveryCertaintyPayload {
  nodeId: string
  band: 'PROVEN' | 'PROVEN_INCOMPLETE' | 'UNKNOWN'
  confidence: number
  blockingPillars: string[]
  pillars: CertaintyPillarView[]
}
