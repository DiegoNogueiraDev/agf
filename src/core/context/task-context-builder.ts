/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Assembles a compact TaskContext from the SQLite store or a graph snapshot.
 * WHY: central builder that collapses neighborhood queries into a typed struct
 * the agent can read without additional round-trips. Composing: compact-context-types.ts
 * (types), action-deriver.ts (verdict), token-estimator.ts, context-lifecycle-hooks.ts.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import type { GraphNode, GraphEdge } from '../graph/graph-types.js'
import type { GraphSnapshot } from '../store/graph-snapshot-cache.js'
import type { TaskContext, TaskSummary, BlockerInfo, DependencyInfo, SourceRefInfo } from './compact-context-types.js'
import { getNodeAcFromStore } from '../utils/ac-helpers.js'
import { estimateTokens } from './token-estimator.js'
import { emitContextHook } from '../hooks/context-lifecycle-hooks.js'
import { deriveNextAction } from './action-deriver.js'
import { createLogger } from '../utils/logger.js'
import {
  economyLeversSourceFromDb,
  resolveEconomyLeversConfig,
  isLeverEnabled,
  getLeverParam,
} from '../economy/economy-levers-config.js'
import { recordLeverEvent } from '../economy/economy-lever-ledger.js'
import { pickNeighborIds, type ContextSelectStrategy } from './context-select-strategy.js'
import type { SelectionCandidate } from './submodular-select.js'

const log = createLogger({ layer: 'core', source: 'task-context-builder.ts' })

function toTaskSummary(node: GraphNode): TaskSummary {
  const summary: TaskSummary = {
    id: node.id,
    type: node.type,
    title: node.title,
    status: node.status,
    priority: node.priority,
  }
  if (node.description) summary.description = node.description
  if (node.sprint) summary.sprint = node.sprint
  if (node.xpSize) summary.xpSize = node.xpSize
  if (node.tags?.length) summary.tags = node.tags
  return summary
}

function isInferred(edge: GraphEdge): boolean {
  return edge.metadata?.inferred === true
}

/**
 * Opções da seleção de vizinhos (node_efcdb61eef95). Só têm efeito quando a
 * lever `submodular_select` está ON — OFF ⇒ pipeline byte-idêntico ao atual.
 */
export interface TaskContextBuildOptions {
  /** Estratégia do registry (context-select-strategy.ts). Default: 'current' (no-op). */
  selectStrategy?: ContextSelectStrategy
  /** Budget total do pack em tokens. Default: param da lever (2000). */
  budgetTokens?: number
  /** Atribuição no economy_lever_ledger. Default: 'context-build'. */
  sessionId?: string
}

/** Build a compact task context with neighbors and metrics. */
export function buildTaskContext(
  store: SqliteStore,
  nodeId: string,
  snapshot?: GraphSnapshot,
  opts: TaskContextBuildOptions = {},
): TaskContext | null {
  emitContextHook('pre_context_build', { nodeId })
  const snapshotNodeById = snapshot ? new Map(snapshot.nodes.map((n) => [n.id, n])) : null

  // Helper: resolve node by ID using snapshot (O(1)) or store query
  const resolveNode = (id: string): GraphNode | null => {
    if (snapshotNodeById) {
      return snapshotNodeById.get(id) ?? null
    }
    return store.getNodeById(id)
  }

  const node = resolveNode(nodeId)
  if (!node) {
    log.warn(`buildTaskContext: node ${nodeId} not found`)
    return null
  }

  // Parent
  let parent: TaskSummary | null = null
  if (node.parentId) {
    const parentNode = resolveNode(node.parentId)
    if (parentNode) parent = toTaskSummary(parentNode)
  }

  // Children — from snapshot or store
  let childNodes: GraphNode[]
  if (snapshot) {
    childNodes = []
    for (const nVar of snapshot.nodes) {
      if (nVar.parentId === nodeId) childNodes.push(nVar)
    }
  } else {
    childNodes = store.getChildNodes(nodeId)
  }
  const children = childNodes.map(toTaskSummary)

  // Incoming/outgoing edges — from snapshot or store
  let incomingEdges: GraphEdge[]
  let outgoingEdges: GraphEdge[]
  if (snapshot) {
    incomingEdges = []
    outgoingEdges = []
    for (const e of snapshot.edges) {
      if (e.to === nodeId) incomingEdges.push(e)
      if (e.from === nodeId) outgoingEdges.push(e)
    }
  } else {
    incomingEdges = store.getEdgesTo(nodeId)
    outgoingEdges = store.getEdgesFrom(nodeId)
  }

  const blockers: BlockerInfo[] = []
  const dependsOn: DependencyInfo[] = []
  const relatedIds = new Set<string>()
  const relatedNodes: TaskSummary[] = []
  const implementsNodes: TaskSummary[] = []
  const derivedFromNodes: TaskSummary[] = []
  let edgeParent: TaskSummary | null = null
  const edgeChildren: TaskSummary[] = []
  const edgeChildrenIds = new Set<string>()

  // Edges where something blocks this node: edge.relationType === "blocks" AND edge.to === nodeId
  for (const edge of incomingEdges) {
    if (edge.relationType === 'blocks') {
      const blockerNode = resolveNode(edge.from)
      if (blockerNode) {
        blockers.push({
          id: blockerNode.id,
          title: blockerNode.title,
          status: blockerNode.status,
          relationType: edge.relationType,
          inferred: isInferred(edge),
        })
      }
    } else if (edge.relationType === 'related_to') {
      const relNode = resolveNode(edge.from)
      if (relNode && !relatedIds.has(relNode.id)) {
        relatedIds.add(relNode.id)
        relatedNodes.push(toTaskSummary(relNode))
      }
    } else if (edge.relationType === 'parent_of' && !edgeParent) {
      const parentNode = resolveNode(edge.from)
      if (parentNode) edgeParent = toTaskSummary(parentNode)
    }
  }

  // Edges where this node depends_on something: edge.relationType === "depends_on" AND edge.from === nodeId
  for (const edge of outgoingEdges) {
    if (edge.relationType === 'depends_on') {
      const depNode = resolveNode(edge.to)
      if (depNode) {
        dependsOn.push({
          id: depNode.id,
          title: depNode.title,
          status: depNode.status,
          resolved: depNode.status === 'done',
          inferred: isInferred(edge),
        })
      }
    } else if (edge.relationType === 'related_to') {
      const relNode = resolveNode(edge.to)
      if (relNode && !relatedIds.has(relNode.id)) {
        relatedIds.add(relNode.id)
        relatedNodes.push(toTaskSummary(relNode))
      }
    } else if (edge.relationType === 'implements') {
      const implNode = resolveNode(edge.to)
      if (implNode) implementsNodes.push(toTaskSummary(implNode))
    } else if (edge.relationType === 'derived_from') {
      const derivedNode = resolveNode(edge.to)
      if (derivedNode) derivedFromNodes.push(toTaskSummary(derivedNode))
    } else if (edge.relationType === 'parent_of') {
      const childNode = resolveNode(edge.to)
      if (childNode && !edgeChildrenIds.has(childNode.id)) {
        edgeChildrenIds.add(childNode.id)
        edgeChildren.push(toTaskSummary(childNode))
      }
    }
  }

  // Acceptance criteria (inline + child AC nodes) — targeted queries, no full graph scan
  const acceptanceCriteria = getNodeAcFromStore(store, node.id)

  // Source reference
  const sourceRef: SourceRefInfo | null = node.sourceRef ? { ...node.sourceRef } : null

  const summary = toTaskSummary(node)

  // node_efcdb61eef95 — seleção de vizinhos sob budget, atrás da lever
  // submodular_select (default-OFF ⇒ este bloco é no-op e a saída fica
  // byte-idêntica). Poda as listas ANTES da montagem para que as métricas do
  // pack reflitam o que foi de fato selecionado.
  const lists = {
    children,
    blockers,
    dependsOn,
    relatedNodes,
    implementsNodes,
    derivedFromNodes,
    edgeChildren,
  }
  const pruned = applySelectStrategy(store, nodeId, opts, {
    lists,
    edges: [...incomingEdges, ...outgoingEdges],
    coreTokens: estimateTokens(JSON.stringify({ task: summary, parent, acceptanceCriteria, sourceRef })),
  })
  const finalLists = pruned ?? lists

  // Metrics: estimate original size from local data already loaded (node + children + deps)
  const localNodes = [node, ...childNodes]
  const originalChars =
    localNodes.reduce(
      (sum, n) => sum + n.title.length + (n.description?.length ?? 0) + (n.acceptanceCriteria?.join('').length ?? 0),
      0,
    ) + [...incomingEdges, ...outgoingEdges].reduce((sum, e) => sum + (e.reason?.length ?? 0), 0)

  // Build payload without 'node' alias for accurate metrics calculation
  const corePayload = {
    task: summary,
    parent,
    children: finalLists.children,
    blockers: finalLists.blockers,
    dependsOn: finalLists.dependsOn,
    relatedNodes: finalLists.relatedNodes.length > 0 ? finalLists.relatedNodes : undefined,
    implementsNodes: finalLists.implementsNodes.length > 0 ? finalLists.implementsNodes : undefined,
    derivedFromNodes: finalLists.derivedFromNodes.length > 0 ? finalLists.derivedFromNodes : undefined,
    edgeParent: edgeParent ?? undefined,
    edgeChildren: finalLists.edgeChildren.length > 0 ? finalLists.edgeChildren : undefined,
    acceptanceCriteria,
    sourceRef,
    metrics: { originalChars: 0, compactChars: 0, reductionPercent: 0, estimatedTokens: 0 },
  }

  const compactJson = JSON.stringify(corePayload)
  const compactChars = compactJson.length
  // Bug #034: negative values indicate expansion (JSON overhead > raw text).
  // This is expected for small nodes where structure metadata exceeds original content.
  const reductionPercent = originalChars > 0 ? Math.round(((originalChars - compactChars) / originalChars) * 100) : 0

  const metrics = {
    originalChars,
    compactChars,
    reductionPercent,
    estimatedTokens: estimateTokens(compactJson),
  }

  // Bug #035: assemble final payload with 'node' alias (same reference as 'task')
  const baseCtx: TaskContext = {
    ...corePayload,
    node: summary,
    metrics,
  }
  // Derived next-action verdict (pure, no extra query) — additive optional field.
  const contextPayload: TaskContext = { ...baseCtx, nextAction: deriveNextAction(baseCtx) }

  log.info(`Context for ${nodeId}: ${metrics.estimatedTokens} tokens, ${metrics.reductionPercent}% reduction`)

  emitContextHook('post_context_build', {
    nodeId,
    estimatedTokens: metrics.estimatedTokens,
    reductionPercent: metrics.reductionPercent,
  })
  return contextPayload
}

/** Overhead JSON (vírgulas/colchetes) por item de lista, em tokens. */
const JSON_ITEM_OVERHEAD_TOKENS = 1
/** Reserva p/ campos montados após a poda (metrics, edgeParent, separadores). */
const PACK_ASSEMBLY_RESERVE_TOKENS = 60

interface NeighborLists {
  children: TaskSummary[]
  blockers: BlockerInfo[]
  dependsOn: DependencyInfo[]
  relatedNodes: TaskSummary[]
  implementsNodes: TaskSummary[]
  derivedFromNodes: TaskSummary[]
  edgeChildren: TaskSummary[]
}

/**
 * Aplica a estratégia de seleção de vizinhos (node_efcdb61eef95) quando — e só
 * quando — a lever `submodular_select` está ON e a estratégia ≠ 'current'.
 * Retorna as listas podadas, ou null para "não mexa" (caminho byte-idêntico).
 * A economia real (tokens antes/depois) é gravada no economy_lever_ledger;
 * falha de ledger nunca quebra a montagem do contexto.
 */
function applySelectStrategy(
  store: SqliteStore,
  nodeId: string,
  opts: TaskContextBuildOptions,
  input: { lists: NeighborLists; edges: GraphEdge[]; coreTokens: number },
): NeighborLists | null {
  const strategy = opts.selectStrategy ?? 'current'
  if (strategy === 'current') return null
  const cfg = resolveEconomyLeversConfig(economyLeversSourceFromDb(store.getDb()))
  if (!isLeverEnabled(cfg, 'submodular_select')) return null

  const { lists, edges, coreTokens } = input
  const budget = opts.budgetTokens ?? getLeverParam(cfg, 'submodular_select', 'budgetTokens', 2000)

  // Candidatos dedupados por id (um nó pode aparecer em mais de uma lista).
  const byId = new Map<string, SelectionCandidate>()
  const allItems: Array<{ id: string; title: string; description?: string }> = [
    ...lists.children,
    ...lists.blockers,
    ...lists.dependsOn,
    ...lists.relatedNodes,
    ...lists.implementsNodes,
    ...lists.derivedFromNodes,
    ...lists.edgeChildren,
  ]
  for (const item of allItems) {
    if (byId.has(item.id)) continue
    byId.set(item.id, {
      id: item.id,
      text: `${item.title} ${item.description ?? ''}`,
      tokens: estimateTokens(JSON.stringify(item)) + JSON_ITEM_OVERHEAD_TOKENS,
    })
  }
  if (byId.size === 0) return null

  const candidates = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1))
  const picked = pickNeighborIds(strategy, {
    centerId: nodeId,
    candidates,
    edges: edges.map((e) => ({ id: e.id, from: e.from, to: e.to })),
    budgetTokens: Math.max(0, budget - coreTokens - PACK_ASSEMBLY_RESERVE_TOKENS),
  })

  const keep = <T extends { id: string }>(arr: T[]): T[] => arr.filter((x) => picked.has(x.id))
  const prunedLists: NeighborLists = {
    children: keep(lists.children),
    blockers: keep(lists.blockers),
    dependsOn: keep(lists.dependsOn),
    relatedNodes: keep(lists.relatedNodes),
    implementsNodes: keep(lists.implementsNodes),
    derivedFromNodes: keep(lists.derivedFromNodes),
    edgeChildren: keep(lists.edgeChildren),
  }

  let pickedTokens = 0
  let allTokens = 0
  for (const c of candidates) {
    allTokens += c.tokens
    if (picked.has(c.id)) pickedTokens += c.tokens
  }
  const saved = allTokens - pickedTokens
  if (saved > 0) {
    try {
      recordLeverEvent(store.getDb(), {
        sessionId: opts.sessionId ?? 'context-build',
        nodeId,
        lever: 'submodular_select',
        tokensBefore: coreTokens + allTokens,
        tokensAfter: coreTokens + pickedTokens,
        saved,
        accepted: true,
        gateOutcome: 'accepted',
        surface: 'context',
      })
    } catch (err) {
      log.warn(`submodular_select ledger write failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return prunedLists
}
