/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * entry-gate (node_dd0aaabbed5c, épico gates node_9e6f73a0bc3b) — o gate de
 * ENTRADA do fluxo: um pull só acontece quando o SUBTREE DO ÉPICO da task não
 * tem gap required aberto. Backlog só vira executável quando a rastreabilidade
 * fecha (Boehm 1981: defeito rio abaixo custa 10-100x; Shingo: poka-yoke na
 * fonte). NUNCA olha o grafo global — dívida required de outros épicos não
 * trava a colônia (anti-falso-positivo, mitigação do risk node_587779d95a29).
 * Reusa os detectors de index.ts (detectAllGaps) — zero detector novo.
 *
 * Consumidores: start-cmd.ts (startTaskPipeline via deps.entryGate) e
 * next-cmd.ts. Escape: --force pull com warning GAPS_FORCED.
 */

import type { GraphDocument, GraphNode } from '../graph/graph-types.js'
import type { Gap } from './gap-types.js'
import { detectAllGaps } from './index.js'

export interface EpicEntryGateResult {
  blocked: boolean
  /** Épico-raiz da task (ancestral mais alto do tipo epic), quando existe. */
  epicId?: string
  /** Gaps required ancorados no subtree do épico. */
  gaps: Gap[]
  /** Comandos exatos que fecham cada gap (achatado dos enrichments). */
  applyVia: string[]
}

const CLEAN: EpicEntryGateResult = { blocked: false, gaps: [], applyVia: [] }

/** Sobe parentId até o ancestral epic mais alto; undefined quando não há épico. */
function resolveRootEpic(byId: Map<string, GraphNode>, taskId: string): string | undefined {
  let current = byId.get(taskId)
  let epicId: string | undefined
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    if (current.type === 'epic') epicId = current.id
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return epicId
}

/** Ids do subtree do épico (BFS por parentId), incluindo o próprio épico. */
function collectSubtreeIds(nodes: readonly GraphNode[], epicId: string): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const n of nodes) {
    if (!n.parentId) continue
    const arr = childrenOf.get(n.parentId) ?? []
    arr.push(n.id)
    childrenOf.set(n.parentId, arr)
  }
  const subtree = new Set<string>([epicId])
  const queue = [epicId]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const child of childrenOf.get(id) ?? []) {
      if (!subtree.has(child)) {
        subtree.add(child)
        queue.push(child)
      }
    }
  }
  return subtree
}

/**
 * Avalia o gate de entrada para o pull de `taskId`. Task inexistente ou sem
 * épico ancestral ⇒ nunca bloqueia (caso de limite — greenfield/órfã segue o
 * fluxo atual). Determinístico e puro sobre o documento.
 */
export function checkEpicEntryGate(doc: GraphDocument, taskId: string): EpicEntryGateResult {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]))
  if (!byId.has(taskId)) return CLEAN

  const epicId = resolveRootEpic(byId, taskId)
  if (!epicId) return CLEAN

  const subtree = collectSubtreeIds(doc.nodes, epicId)
  const gaps = detectAllGaps(doc).filter(
    (g) => g.severity === 'required' && g.nodeId !== undefined && subtree.has(g.nodeId),
  )
  if (gaps.length === 0) return { blocked: false, epicId, gaps: [], applyVia: [] }

  return {
    blocked: true,
    epicId,
    gaps,
    applyVia: gaps.flatMap((g) => g.enrichment.applyVia),
  }
}
