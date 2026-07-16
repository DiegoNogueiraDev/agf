/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Context Select Strategy — registry de estratégias de seleção de vizinhos do
 * context-pack sob budget de tokens (node_efcdb61eef95; contract node_0b2652135f9c).
 *
 * WHY: o task-context-builder monta listas de vizinhos sem limite; atrás da
 * lever `submodular_select` (default-OFF ⇒ byte-idêntico) este módulo escolhe
 * QUAIS vizinhos entram no pack: `submodular` = facility-location + CELF
 * (./submodular-select.ts, garantia 1−1/e) e `pcst` = subárvore conexa com
 * prizes do heat-kernel (./pcst-select.ts, G-Retriever). Registry/tabela (OCP):
 * estratégia nova = entrada nova, o motor do builder não muda.
 *
 * CONTRATO: pickNeighborIds retorna o conjunto de ids que PERMANECEM no pack;
 * determinístico para o mesmo input; `current` nunca chega aqui (o builder
 * curto-circuita antes).
 */

import { selectSubmodular, type SelectionCandidate } from './submodular-select.js'
import { selectPcst, type PcstEdge } from './pcst-select.js'

export type ContextSelectStrategy = 'current' | 'submodular' | 'pcst'

export interface NeighborPruneInput {
  /** Nó central do pack (sempre mantido; seed do PCST). */
  centerId: string
  /** Vizinhos candidatos, dedupados por id, com custo em tokens já estimado. */
  candidates: SelectionCandidate[]
  /** Edges do grafo restritas ao pack (centro + candidatos) — base do PCST. */
  edges: PcstEdge[]
  /** Budget de tokens disponível para os vizinhos (core já descontado). */
  budgetTokens: number
}

type NeighborPicker = (input: NeighborPruneInput) => string[]

/** Registry OCP: adicionar estratégia = adicionar entrada, não editar o motor. */
const STRATEGIES: Record<Exclude<ContextSelectStrategy, 'current'>, NeighborPicker> = {
  submodular: ({ candidates, budgetTokens }) => selectSubmodular(candidates, budgetTokens).picked,
  pcst: pickPcstUnderTokenBudget,
}

/** Ids de vizinhos que permanecem no pack sob a estratégia dada. */
export function pickNeighborIds(
  strategy: Exclude<ContextSelectStrategy, 'current'>,
  input: NeighborPruneInput,
): Set<string> {
  return new Set(STRATEGIES[strategy](input))
}

/**
 * PCST sob budget de TOKENS: roda o crescimento guloso sem limite de nós e
 * corta o PREFIXO da ordem de anexação que cabe no budget — todo prefixo do
 * crescimento é conexo por construção (cada nó anexa a um que já está na árvore),
 * então parar no primeiro estouro preserva a conectividade.
 */
function pickPcstUnderTokenBudget({ centerId, candidates, edges, budgetTokens }: NeighborPruneInput): string[] {
  const nodeIds = new Set([centerId, ...candidates.map((c) => c.id)])
  const graph = {
    nodes: [...nodeIds].sort(),
    edges: edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to)),
  }
  const tokensById = new Map(candidates.map((c) => [c.id, c.tokens]))
  const grown = selectPcst(graph, [centerId], nodeIds.size)

  const picked: string[] = []
  let spent = 0
  for (const id of grown.nodeIds) {
    if (id === centerId) continue
    const cost = tokensById.get(id) ?? 0
    if (spent + cost > budgetTokens) break // prefixo conexo: parar, não pular
    picked.push(id)
    spent += cost
  }
  return picked
}
