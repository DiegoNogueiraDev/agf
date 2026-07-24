/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Smart Decompose — automatically breaks large tasks into subtasks based on AC.
 * Rule: 1 AC = 1 subtask. Test type inferred from keywords. Dependencies by order.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { generateId } from '../utils/id.js'
import { createLogger } from '../utils/logger.js'
import { validateInvest, type InvestCandidate, type XpSize } from './invest-validator.js'

const log = createLogger({ layer: 'core', source: 'smart-decompose.ts' })

export interface DecomposedSubtask {
  title: string
  type: 'subtask'
  acceptanceCriteria: string[]
  estimateMinutes: number
  suggestedTestType: 'unit' | 'integration' | 'e2e'
}

export interface DecomposedEdge {
  from: string
  to: string
  relation: 'depends_on'
}

export interface DecomposeResult {
  parentId: string
  subtasks: DecomposedSubtask[]
  edges: DecomposedEdge[]
  rationale: string
}

const INTEGRATION_KEYWORDS = [
  'api',
  'endpoint',
  'database',
  'db',
  'persiste',
  'persists',
  'saves',
  'sync',
  'indexa',
  'indexes',
  'fetch',
  'request',
  'response',
  'query',
  'http',
  'rest',
  'graphql',
  'grpc',
  'webhook',
]

const E2E_KEYWORDS = [
  'page',
  'navega',
  'navigates',
  'click',
  'clicks',
  'form',
  'browser',
  'redirect',
  'ui',
  'dashboard',
  'tab',
  'button',
  'modal',
  'toast',
  'screen',
  'display',
  'render',
  'shows',
  'visible',
]

/**
 * Infer test type from AC text based on keywords.
 */
function inferTestType(acText: string): 'unit' | 'integration' | 'e2e' {
  const lower = acText.toLowerCase()

  if (E2E_KEYWORDS.some((kw) => lower.includes(kw))) return 'e2e'
  if (INTEGRATION_KEYWORDS.some((kw) => lower.includes(kw))) return 'integration'
  return 'unit'
}

/**
 * Extract a short title from AC text.
 */
function acToTitle(ac: string, index: number): string {
  // Take first 60 chars, trim at word boundary
  const truncated = ac.length > 60 ? ac.slice(0, 60).replace(/\s\S*$/, '...') : ac
  return `Subtask ${index + 1}: ${truncated}`
}

/**
 * Estimate minutes based on test type complexity.
 */
function estimateFromTestType(testType: 'unit' | 'integration' | 'e2e'): number {
  switch (testType) {
    case 'unit':
      return 30
    case 'integration':
      return 60
    case 'e2e':
      return 90
  }
}

/**
 * Decompose a task into subtasks based on its acceptance criteria.
 * Returns null if node not found or has no AC.
 */
/** Decompose a task into subtasks based on acceptance criteria. */
export function smartDecompose(store: SqliteStore, nodeId: string): DecomposeResult | null {
  const node = store.getNodeById(nodeId)
  if (!node) {
    log.warn('smart-decompose:node_not_found', { nodeId })
    return null
  }

  // Collect AC from inline + child AC nodes
  const doc = store.toGraphDocument()
  const acChildNodes = doc.nodes.filter((n) => n.type === 'acceptance_criteria' && n.parentId === nodeId)
  const acTexts = [...(node.acceptanceCriteria ?? []), ...acChildNodes.map((n) => n.title)]

  if (acTexts.length === 0) {
    log.info('smart-decompose:no_ac', { nodeId })
    return null
  }

  // 1 AC = 1 subtask
  const subtaskIds: string[] = []
  const subtasks: DecomposedSubtask[] = acTexts.map((ac, i) => {
    subtaskIds.push(generateId('sub'))
    const testType = inferTestType(ac)
    return {
      title: acToTitle(ac, i),
      type: 'subtask' as const,
      acceptanceCriteria: [ac],
      estimateMinutes: estimateFromTestType(testType),
      suggestedTestType: testType,
    }
  })

  // Dependencies: each subtask depends on the previous one (sequential order)
  const edges: DecomposedEdge[] = []
  for (let i = 1; i < subtaskIds.length; i++) {
    edges.push({
      from: subtaskIds[i],
      to: subtaskIds[i - 1],
      relation: 'depends_on',
    })
  }

  log.info('smart-decompose:ok', {
    nodeId,
    subtasks: subtasks.length,
    edges: edges.length,
    testTypes: subtasks.map((s) => s.suggestedTestType),
  })

  return {
    parentId: nodeId,
    subtasks,
    edges,
    rationale: `Decomposed "${node.title}" into ${subtasks.length} subtasks (1 per AC). Test types: ${subtasks.map((s) => s.suggestedTestType).join(', ')}.`,
  }
}

// ── INVEST-gated decomposition ────────────────────────────────────────────────

export interface InvestChild {
  id: string
  title: string
  xpSize: XpSize
  acceptanceCriteria: string[]
}

export interface InvestRejection {
  title: string
  reasons: string[]
}

export interface DecomposeEdgeWithRelation {
  from: string
  to: string
  relation: 'decomposed_into'
}

export interface SmartDecomposeInvestResult {
  parentId: string
  accepted: InvestChild[]
  rejected: InvestRejection[]
  edges: DecomposeEdgeWithRelation[]
}

/** Sizes eligible for generated children */
const CHILD_SIZES: XpSize[] = ['S', 'M']

/** Generate 2 placeholder children when the parent has no AC */
function generatePlaceholderChildren(title: string): InvestCandidate[] {
  return [
    {
      title: `${title} — part 1: core implementation`,
      xpSize: 'S',
      acceptanceCriteria: [
        `GIVEN ${title} WHEN core logic runs THEN primary outcome is produced`,
        `GIVEN invalid input WHEN ${title} runs THEN error is handled gracefully`,
      ],
    },
    {
      title: `${title} — part 2: validation and integration`,
      xpSize: 'M',
      acceptanceCriteria: [
        `GIVEN ${title} WHEN integration boundary is reached THEN data persists correctly`,
        `GIVEN ${title} with edge case WHEN processing THEN result is deterministic`,
      ],
    },
  ]
}

/** Build InvestCandidates from the node's AC list (1 AC → 1 child) */
function candidatesFromAc(parentTitle: string, acTexts: string[]): InvestCandidate[] {
  return acTexts.map((ac, i) => ({
    title: `${parentTitle} — part ${i + 1}`,
    xpSize: CHILD_SIZES[i % CHILD_SIZES.length],
    acceptanceCriteria: [ac],
  }))
}

/**
 * INVEST-gated decomposition.
 *
 * Triggers for L/XL tasks only. If the task has no AC, generates placeholder
 * children with at least 2 testable AC each. Each proposed child is then
 * validated against INVEST; passing children produce `decomposed_into` edges,
 * failing children are recorded in `rejected` with reasons.
 *
 * Returns null for non-oversized tasks (XS/S/M) or missing nodes.
 */
export function smartDecomposeWithInvest(store: SqliteStore, nodeId: string): SmartDecomposeInvestResult | null {
  const node = store.getNodeById(nodeId)
  if (!node) {
    log.warn('smart-decompose-invest:node_not_found', { nodeId })
    return null
  }

  if (node.xpSize !== 'L' && node.xpSize !== 'XL') {
    return null
  }

  // Gather existing AC from inline + child AC nodes
  const doc = store.toGraphDocument()
  const acChildNodes = doc.nodes.filter((n) => n.type === 'acceptance_criteria' && n.parentId === nodeId)
  const acTexts = [...(node.acceptanceCriteria ?? []), ...acChildNodes.map((n) => n.title)]

  const candidates: InvestCandidate[] =
    acTexts.length === 0 ? generatePlaceholderChildren(node.title) : candidatesFromAc(node.title, acTexts)

  const accepted: InvestChild[] = []
  const rejected: InvestRejection[] = []
  const edges: DecomposeEdgeWithRelation[] = []

  for (const candidate of candidates) {
    const { passed, rejectedReasons } = validateInvest(candidate)
    if (passed) {
      const childId = generateId('sub')
      accepted.push({
        id: childId,
        title: candidate.title,
        xpSize: candidate.xpSize ?? 'S',
        acceptanceCriteria: candidate.acceptanceCriteria,
      })
      edges.push({ from: nodeId, to: childId, relation: 'decomposed_into' })
    } else {
      rejected.push({ title: candidate.title, reasons: rejectedReasons })
    }
  }

  log.info('smart-decompose-invest:ok', {
    nodeId,
    accepted: accepted.length,
    rejected: rejected.length,
  })

  return { parentId: nodeId, accepted, rejected, edges }
}

// ── Auto-trigger helpers — Task 1.1: decompositionProposal in start_task ─────

const LARGE_SIZES = new Set(['L', 'XL'])
const MIN_AC_FOR_PROPOSAL = 2

/**
 * Returns true when start_task should offer a decomposition proposal:
 * task is L/XL, has ≥2 ACs, and has no existing task/subtask children.
 */
export function shouldSuggestDecomposition(
  xpSize: string | null | undefined,
  acCount: number,
  childTaskCount: number,
): boolean {
  return LARGE_SIZES.has(xpSize ?? '') && acCount >= MIN_AC_FOR_PROPOSAL && childTaskCount === 0
}

/**
 * Persist a DecomposeResult to the store: inserts each subtask and their edges.
 * Called when the agent confirms the proposal (acceptDecomposition: true).
 */
export function persistDecomposition(store: SqliteStore, result: DecomposeResult, parentId: string): void {
  const subtaskIds: string[] = []
  for (const sub of result.subtasks) {
    const id = generateId('sub')
    subtaskIds.push(id)
    store.insertNode({
      id,
      type: 'subtask',
      title: sub.title,
      status: 'backlog',
      priority: 3,
      parentId,
      acceptanceCriteria: sub.acceptanceCriteria,
      estimateMinutes: sub.estimateMinutes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as import('../graph/graph-types.js').GraphNode)
  }

  // Sequential dependencies from result.edges (index-based from, to)
  for (let i = 0; i < result.edges.length; i++) {
    const edge = result.edges[i]
    if (edge && i < subtaskIds.length - 1) {
      store.insertEdge({
        id: generateId('edge'),
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §fix-ci-lint
        from: subtaskIds[i + 1]!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §fix-ci-lint
        to: subtaskIds[i]!,
        relationType: 'depends_on',
        createdAt: new Date().toISOString(),
      })
    }
  }

  log.info('smart-decompose:persisted', { parentId, count: subtaskIds.length })
}
