/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * PCST Select — Prize-Collecting Steiner Tree aproximado sobre o grafo, com
 * prizes vindos da difusão heat-kernel (node_78079c05b0e2; contract
 * node_0b2652135f9c; G-Retriever arXiv 2402.07630).
 *
 * WHY: contexto CONEXO e explicável — em vez de ranquear nós isoladamente, o
 * PCST devolve uma subárvore que maximiza Σ prizes − custo·|edges|, então cada
 * nó selecionado tem um caminho até o seed (a "explicação" de por que entrou).
 * PCST exato é NP-hard; a aproximação aqui é crescimento guloso de fronteira:
 * parte do melhor seed e anexa, um a um, o vizinho da árvore com maior
 * `prize − edgeCost` enquanto o ganho for positivo e o budget de nós couber.
 *
 * Prizes = score da difusão existente em {@link heatKernelRelevance}
 * (./heat-kernel.ts — consumida, NÃO recriada), somado sobre os seeds.
 * Determinístico: desempate por id ascendente em toda escolha (seed inicial,
 * nó da fronteira, edge de anexação). Um cluster desconexo dos seeds tem
 * difusão 0 e nunca entra (inalcançável pela fronteira E podado por gain ≤ 0).
 */

import { McpGraphError } from '../utils/errors.js'
import { heatKernelRelevance, type HeatKernelOptions } from './heat-kernel.js'

export interface PcstEdge {
  id: string
  from: string
  to: string
}

export interface PcstGraph {
  nodes: string[]
  edges: PcstEdge[]
}

export interface PcstOptions extends HeatKernelOptions {
  /** Custo constante por edge anexada (poda vizinhos de prize baixo). Default 0.001. */
  edgeCost?: number
}

export interface PcstResult {
  /** Nós da subárvore, em ordem de anexação (seed primeiro). */
  nodeIds: string[]
  /** Edges que conectam a subárvore (|edgeIds| = |nodeIds| − 1 quando não-vazio). */
  edgeIds: string[]
  /** Σ prizes(selecionados) − edgeCost·|edgeIds|. */
  objective: number
}

const DEFAULT_EDGE_COST = 0.001

/**
 * Seleciona uma subárvore conexa de até `budgetNodes` nós a partir de `seeds`,
 * maximizando (aproximadamente) prize − custo. Puro e determinístico.
 */
export function selectPcst(graph: PcstGraph, seeds: string[], budgetNodes: number, opts: PcstOptions = {}): PcstResult {
  if (seeds.length === 0 || budgetNodes <= 0) return { nodeIds: [], edgeIds: [], objective: 0 }

  const nodeSet = new Set(graph.nodes)
  for (const seed of seeds) {
    if (!nodeSet.has(seed)) throw new McpGraphError(`selectPcst: seed "${seed}" not in graph`)
  }

  const edgeCost = opts.edgeCost ?? DEFAULT_EDGE_COST
  const prizes = computePrizes(graph, seeds, opts)
  const adjacency = buildAdjacency(graph.edges)

  // Seed inicial: maior prize; empate → menor id.
  const sortedSeeds = [...seeds].sort((a, b) => prizes[b] - prizes[a] || (a < b ? -1 : 1))
  const root = sortedSeeds[0]

  const inTree = new Set<string>([root])
  const nodeIds: string[] = [root]
  const edgeIds: string[] = []
  let objective = prizes[root] ?? 0

  while (nodeIds.length < budgetNodes) {
    const best = bestFrontierNode(inTree, adjacency, prizes)
    if (!best || prizes[best.node] - edgeCost <= 0) break
    inTree.add(best.node)
    nodeIds.push(best.node)
    edgeIds.push(best.edgeId)
    objective += prizes[best.node] - edgeCost
  }

  return { nodeIds, edgeIds, objective }
}

/** Prize por nó = Σ sobre os seeds da relevância de difusão heat-kernel. */
function computePrizes(graph: PcstGraph, seeds: string[], opts: HeatKernelOptions): Record<string, number> {
  const diffusionGraph = {
    nodes: graph.nodes,
    edges: graph.edges.map((e): [string, string] => [e.from, e.to]),
  }
  const prizes: Record<string, number> = {}
  for (const seed of [...new Set(seeds)].sort()) {
    const relevance = heatKernelRelevance(diffusionGraph, seed, opts)
    for (const [id, score] of Object.entries(relevance)) prizes[id] = (prizes[id] ?? 0) + score
  }
  return prizes
}

interface AdjacentEntry {
  node: string
  edgeId: string
}

function buildAdjacency(edges: readonly PcstEdge[]): Map<string, AdjacentEntry[]> {
  const adjacency = new Map<string, AdjacentEntry[]>()
  const push = (from: string, entry: AdjacentEntry): void => {
    const list = adjacency.get(from)
    if (list) list.push(entry)
    else adjacency.set(from, [entry])
  }
  for (const e of edges) {
    if (e.from === e.to) continue
    push(e.from, { node: e.to, edgeId: e.id })
    push(e.to, { node: e.from, edgeId: e.id })
  }
  return adjacency
}

/**
 * Melhor nó da fronteira (vizinho da árvore fora dela): maior prize; empate →
 * menor id de nó; edge de anexação = menor id entre as que ligam à árvore.
 */
function bestFrontierNode(
  inTree: ReadonlySet<string>,
  adjacency: ReadonlyMap<string, AdjacentEntry[]>,
  prizes: Record<string, number>,
): AdjacentEntry | null {
  let best: AdjacentEntry | null = null
  for (const treeNode of [...inTree].sort()) {
    for (const { node, edgeId } of adjacency.get(treeNode) ?? []) {
      if (inTree.has(node)) continue
      if (
        best === null ||
        (prizes[node] ?? 0) > (prizes[best.node] ?? 0) ||
        ((prizes[node] ?? 0) === (prizes[best.node] ?? 0) &&
          (node < best.node || (node === best.node && edgeId < best.edgeId)))
      ) {
        best = { node, edgeId }
      }
    }
  }
  return best
}
