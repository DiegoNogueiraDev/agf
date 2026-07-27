/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Types, constants, and compression utilities shared across compact-context builders.
 * WHY: owned by compact-context/; split out so each builder imports from one place.
 */

// ── Constants ────────────────────────────────────────────

/** Max characters for neighbor node descriptions. */
export const NEIGHBOR_DESC_LIMIT = 100

/** Max characters for the task's own description in --compressed mode. */
export const COMPRESSED_DESC_LIMIT = 500

/** Max number of ACs kept in --compressed mode. */
export const COMPRESSED_AC_KEEP = 5

/** AC list length threshold — above this, the list is truncated in --compressed mode. */
export const COMPRESSED_AC_LIMIT_MAX = 10

// ── Types ────────────────────────────────────────────────

export interface TaskContext {
  task: TaskSummary
  /** Bug #035: semantic alias — always mirrors 'task', present for all node types */
  node: TaskSummary
  parent: TaskSummary | null
  children: TaskSummary[]
  blockers: BlockerInfo[]
  dependsOn: DependencyInfo[]
  relatedNodes?: TaskSummary[]
  implementsNodes?: TaskSummary[]
  derivedFromNodes?: TaskSummary[]
  edgeParent?: TaskSummary | null
  edgeChildren?: TaskSummary[]
  acceptanceCriteria: string[]
  sourceRef: SourceRefInfo | null
  metrics: ContextMetrics
  /** Derived readiness verdict — lets an agent act without a follow-up check/next call. */
  nextAction?: NextAction
}

/**
 * Deterministic next-step verdict derived from data the neighbourhood already
 * holds (open blockers + unresolved deps + own status). Saves a round-trip:
 * the agent reads readiness + the exact command from the context-pack instead
 * of calling `agf check`/`agf next` to find out. A graph hint, not a DoD ruling.
 */
export interface NextAction {
  /** No open blocker and every dependency resolved. */
  ready: boolean
  /** Node ids of open blockers + unresolved dependencies (empty when ready). */
  blockedBy: string[]
  /** One-line human reason for the verdict. */
  reason: string
  /** The exact `agf` command to run next. */
  suggestedCommand: string
}

export interface TaskSummary {
  id: string
  type: string
  title: string
  status: string
  priority: number
  description?: string
  sprint?: string | null
  xpSize?: string
  tags?: string[]
}

export interface BlockerInfo {
  id: string
  title: string
  status: string
  relationType: string
  inferred: boolean
}

export interface DependencyInfo {
  id: string
  title: string
  status: string
  resolved: boolean
  inferred: boolean
}

export interface SourceRefInfo {
  file: string
  startLine?: number
  endLine?: number
  confidence?: number
}

export interface ContextMetrics {
  originalChars: number
  compactChars: number
  reductionPercent: number
  estimatedTokens: number
}

export interface NaiveNeighborhood {
  task: import('../graph/graph-types.js').GraphNode
  parent: import('../graph/graph-types.js').GraphNode | null
  children: import('../graph/graph-types.js').GraphNode[]
  blockers: import('../graph/graph-types.js').GraphNode[]
  dependsOn: import('../graph/graph-types.js').GraphNode[]
  estimatedTokens: number
}

export interface LayeredTokenMetrics {
  naiveNodeTokens: number
  naiveNeighborhoodTokens: number
  compactContextTokens: number
  neighborTruncatedTokens: number
  shortKeysTokens: number
  defaultOmittedTokens: number
  summaryTierTokens: number
  layer1Savings: number
  layer2Savings: number
  layer3Savings: number
  layer4Savings: number
  totalRealSavings: number
  totalRealSavingsPercent: number
}

export interface TruncatedInfo {
  fields: string[]
  reasons: Record<string, string>
}

export interface CompressedContext {
  payload: Record<string, unknown>
  truncated: TruncatedInfo
  layerMetrics: {
    l1Tokens: number
    l2Tokens: number
    l3Tokens: number
    l4Tokens: number
    totalReductionPercent: number
  }
}

// ── Key Map for structural compression ──────────────────

export const KEY_MAP: Record<string, string> = {
  // TaskContext top-level
  task: 'tk',
  node: 'n',
  parent: 'par',
  children: 'ch',
  blockers: 'bl',
  dependsOn: 'dep',
  acceptanceCriteria: 'ac',
  sourceRef: 'sr',
  relatedNodes: 'rel',
  implementsNodes: 'impl',
  derivedFromNodes: 'drv',
  edgeParent: 'ep',
  edgeChildren: 'ech',
  metrics: 'm',
  nextAction: 'na',
  // TaskSummary / shared fields
  id: 'i',
  type: 't',
  title: 'n',
  status: 's',
  priority: 'p',
  description: 'd',
  sprint: 'sp',
  xpSize: 'xs',
  tags: 'tg',
  // BlockerInfo / DependencyInfo
  relationType: 'rt',
  inferred: 'inf',
  resolved: 'res',
  // SourceRefInfo
  file: 'f',
  startLine: 'sl',
  endLine: 'el',
  confidence: 'cf',
  // ContextMetrics
  originalChars: 'oc',
  compactChars: 'cc',
  reductionPercent: 'rp',
  estimatedTokens: 'et',
}

export const KEY_LEGEND: Record<string, string> = {}
for (const [full, short] of Object.entries(KEY_MAP)) {
  KEY_LEGEND[short] = full
}

// ── Shared utility functions ─────────────────────────────

/**
 * Truncate a description to a character limit, preferring sentence boundaries.
 */
export function truncateDescription(desc: string | undefined, limit: number): string | undefined {
  if (desc === undefined || desc.length <= limit) return desc
  const sentenceEnd = desc.lastIndexOf('.', limit)
  if (sentenceEnd > limit * 0.5) return desc.slice(0, sentenceEnd + 1)
  return desc.slice(0, limit) + '…'
}

/**
 * Recursively rename object keys using KEY_MAP.
 */
export function compressKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(compressKeys)
  if (typeof obj === 'object') {
    const resultValue: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const newKey = KEY_MAP[key] ?? key
      resultValue[newKey] = typeof value === 'object' && value !== null ? compressKeys(value) : value
    }
    return resultValue
  }
  return obj
}

/**
 * Recursively omit fields with default values.
 * Defaults: priority=3, status="backlog", inferred=false, resolved=false
 */
export function omitDefaults(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(omitDefaults)
  if (typeof obj === 'object') {
    const resultValue: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === 'priority' && value === 3) continue
      if (key === 'status' && value === 'backlog') continue
      if (key === 'inferred' && value === false) continue
      if (key === 'resolved' && value === false) continue
      resultValue[key] = typeof value === 'object' && value !== null ? omitDefaults(value) : value
    }
    return resultValue
  }
  return obj
}
