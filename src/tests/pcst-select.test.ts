/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'
import { selectPcst, type PcstGraph } from '../core/context/pcst-select.js'

// node_78079c05b0e2 — PCST aproximado com prizes do heat-kernel (G-Retriever
// arXiv 2402.07630): subárvore conexa que maximiza prize − custo de edge.
// Grafo :memory: de 2 clusters SEM aresta entre eles: o cluster irrelevante
// tem difusão 0 a partir dos seeds e nunca entra na seleção.

function buildTwoClusterStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('pcst-test')
  const now = new Date().toISOString()
  const addNode = (id: string): void => {
    store.insertNode({
      id,
      type: 'task',
      title: `Node ${id}`,
      status: 'backlog',
      priority: 2,
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
  }
  const addEdge = (id: string, from: string, to: string): void => {
    store.insertEdge({ id, from, to, relationType: 'related_to', createdAt: now } as GraphEdge)
  }
  // Cluster A: estrela a1—(a2..a5) + cauda a5—a6.
  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']) addNode(id)
  addEdge('eA12', 'a1', 'a2')
  addEdge('eA13', 'a1', 'a3')
  addEdge('eA14', 'a1', 'a4')
  addEdge('eA15', 'a1', 'a5')
  addEdge('eA56', 'a5', 'a6')
  // Cluster B: caminho b1—b2—b3—b4, desconexo do A.
  for (const id of ['b1', 'b2', 'b3', 'b4']) addNode(id)
  addEdge('eB12', 'b1', 'b2')
  addEdge('eB23', 'b2', 'b3')
  addEdge('eB34', 'b3', 'b4')
  return store
}

function graphFromStore(store: SqliteStore): PcstGraph {
  const doc = store.toGraphDocument()
  return {
    nodes: doc.nodes.map((n) => n.id),
    edges: doc.edges.map((e) => ({ id: e.id, from: e.from, to: e.to })),
  }
}

/** BFS sobre as edges selecionadas: todo nó selecionado é alcançável do seed? */
function isConnectedFrom(seed: string, nodeIds: string[], edges: PcstGraph['edges'], edgeIds: string[]): boolean {
  const chosen = new Set(edgeIds)
  const inTree = new Set(nodeIds)
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    if (!chosen.has(e.id)) continue
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to])
    adj.set(e.to, [...(adj.get(e.to) ?? []), e.from])
  }
  const seen = new Set<string>([seed])
  const queue = [seed]
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const nxt of adj.get(cur) ?? []) {
      if (!seen.has(nxt) && inTree.has(nxt)) {
        seen.add(nxt)
        queue.push(nxt)
      }
    }
  }
  return nodeIds.every((id) => seen.has(id))
}

describe('selectPcst — PCST guloso com prizes do heat-kernel', () => {
  it('AC1: seeds num só cluster + budget 10 ⇒ resultado conexo e zero nós do cluster irrelevante', () => {
    const store = buildTwoClusterStore()
    const graph = graphFromStore(store)
    store.close()

    const result = selectPcst(graph, ['a1'], 10)

    expect(result.nodeIds.length).toBeGreaterThan(1)
    expect(result.nodeIds).toContain('a1')
    expect(result.nodeIds.filter((id) => id.startsWith('b'))).toEqual([])
    expect(isConnectedFrom('a1', result.nodeIds, graph.edges, result.edgeIds)).toBe(true)
  })

  it('AC2: budget menor que o número de seeds ⇒ count selecionado ≤ budget', () => {
    const store = buildTwoClusterStore()
    const graph = graphFromStore(store)
    store.close()

    const result = selectPcst(graph, ['a1', 'a2', 'a3'], 2)

    expect(result.nodeIds.length).toBeLessThanOrEqual(2)
  })

  it('AC3: empate de prizes (folhas simétricas da estrela) ⇒ determinístico, ordenação estável por id', () => {
    const store = buildTwoClusterStore()
    const graph = graphFromStore(store)
    store.close()

    // a2..a5 são simétricos a partir de a1 (mesma difusão) — o desempate é por id.
    const first = selectPcst(graph, ['a1'], 3)
    const second = selectPcst(graph, ['a1'], 3)

    expect(first.nodeIds).toEqual(second.nodeIds)
    expect(first.edgeIds).toEqual(second.edgeIds)
    expect(first.nodeIds).toEqual(['a1', 'a2', 'a3'])
  })

  it('budget ≤ 0 ou seeds vazios ⇒ seleção vazia', () => {
    const store = buildTwoClusterStore()
    const graph = graphFromStore(store)
    store.close()

    expect(selectPcst(graph, ['a1'], 0).nodeIds).toEqual([])
    expect(selectPcst(graph, [], 5).nodeIds).toEqual([])
  })

  it('seed inexistente ⇒ erro', () => {
    const store = buildTwoClusterStore()
    const graph = graphFromStore(store)
    store.close()

    expect(() => selectPcst(graph, ['ghost'], 5)).toThrow()
  })

  it('nó de prize zero além do custo de edge não entra (poda por gain ≤ 0)', () => {
    const store = buildTwoClusterStore()
    const graph = graphFromStore(store)
    store.close()

    // Com edgeCost alto o crescimento para no seed: nenhum vizinho paga o custo.
    const result = selectPcst(graph, ['a1'], 10, { edgeCost: 10 })

    expect(result.nodeIds).toEqual(['a1'])
    expect(result.edgeIds).toEqual([])
  })
})
