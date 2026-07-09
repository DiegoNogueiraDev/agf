import { describe, it, expect } from 'vitest'
import {
  topologicalSort,
  criticalPath,
  dijkstra,
  bellmanFord,
  floydWarshall,
  tarjanScc,
  bfs,
  dfs,
  kruskalMst,
  primMst,
  fordFulkerson,
  hungarian,
  pageRank,
  betweennessCentrality,
  articulationPoints,
  bridges,
} from '../../core/algorithms/graph-algorithms.js'
import type { GraphNode, GraphEdge } from '../../core/graph/graph-types.js'

function makeEdge(from: string, to: string, weight = 1): GraphEdge {
  return { id: `${from}->${to}`, from, to, relationType: 'depends_on', weight } as GraphEdge
}

function makeNode(id: string): GraphNode {
  return { id, type: 'task', title: id, status: 'backlog', priority: 3, createdAt: '', updatedAt: '' }
}

describe('topologicalSort', () => {
  it('ordena DAG simples', () => {
    const nodes = ['a', 'b', 'c'].map(makeNode)
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')]
    const sorted = topologicalSort(nodes, edges)
    expect(sorted.map((n) => n.id)).toEqual(['a', 'b', 'c'])
  })

  it('retorna array vazio para grafo com ciclo', () => {
    const nodes = ['a', 'b'].map(makeNode)
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'a')]
    const sorted = topologicalSort(nodes, edges)
    expect(sorted).toEqual([])
  })

  it('ordena DAG com multiplas ordenacoes validas', () => {
    const nodes = ['a', 'b', 'c'].map(makeNode)
    const edges = [makeEdge('a', 'c'), makeEdge('b', 'c')]
    const sorted = topologicalSort(nodes, edges)
    expect(sorted[sorted.length - 1].id).toBe('c')
    expect(sorted.length).toBe(3)
  })

  it('ordena grafo vazio', () => {
    expect(topologicalSort([], [])).toEqual([])
  })

  it('ordena node unico sem dependencias', () => {
    expect(topologicalSort([makeNode('a')], []).map((n) => n.id)).toEqual(['a'])
  })
})

describe('criticalPath', () => {
  it('calcula caminho critico em DAG simples', () => {
    const nodes = ['a', 'b', 'c'].map(makeNode)
    const edges = [makeEdge('a', 'b', 3), makeEdge('b', 'c', 2)]
    const cp = criticalPath(nodes, edges)
    expect(cp.path.map((n) => n.id)).toEqual(['a', 'b', 'c'])
    expect(cp.totalDuration).toBe(5)
  })

  it('ignora edges menos custosas', () => {
    const nodes = ['a', 'b', 'c', 'd'].map(makeNode)
    const edges = [makeEdge('a', 'b', 5), makeEdge('a', 'c', 2), makeEdge('b', 'd', 3), makeEdge('c', 'd', 1)]
    const cp = criticalPath(nodes, edges)
    expect(cp.totalDuration).toBe(8)
    expect(cp.path.map((n) => n.id)).toEqual(['a', 'b', 'd'])
  })

  it('retorna path vazio com duracao 0 para ciclo', () => {
    const nodes = ['a', 'b'].map(makeNode)
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'a')]
    const cp = criticalPath(nodes, edges)
    expect(cp.totalDuration).toBe(0)
    expect(cp.path).toEqual([])
  })
})

describe('dijkstra', () => {
  it('encontra caminho mais curto', () => {
    const nodes = ['a', 'b', 'c'].map(makeNode)
    const edges = [makeEdge('a', 'b', 4), makeEdge('b', 'c', 3), makeEdge('a', 'c', 10)]
    const result = dijkstra(nodes, edges, 'a', 'c')
    expect(result).not.toBeNull()
    expect(result!.path.map((n) => n.id)).toEqual(['a', 'b', 'c'])
    expect(result!.distance).toBe(7)
  })

  it('retorna null quando nao ha caminho', () => {
    const nodes = ['a', 'b'].map(makeNode)
    const edges = [] as GraphEdge[]
    const result = dijkstra(nodes, edges, 'a', 'b')
    expect(result).toBeNull()
  })

  it('distancia 0 para src === dest', () => {
    const nodes = ['a'].map(makeNode)
    expect(dijkstra(nodes, [], 'a', 'a')!.distance).toBe(0)
  })
})

describe('bellmanFord', () => {
  it('encontra caminho mais curto sem ciclos negativos', () => {
    const nodes = ['a', 'b', 'c'].map(makeNode)
    const edges = [makeEdge('a', 'b', 4), makeEdge('b', 'c', -2), makeEdge('a', 'c', 5)]
    const dist = bellmanFord(nodes, edges, 'a')
    expect(dist).not.toBeNull()
    expect(dist!.get('c')).toBe(2)
  })

  it('retorna null para ciclo negativo', () => {
    const nodes = ['a', 'b'].map(makeNode)
    const edges = [makeEdge('a', 'b', -1), makeEdge('b', 'a', -1)]
    expect(bellmanFord(nodes, edges, 'a')).toBeNull()
  })
})

describe('floydWarshall', () => {
  it('calcula todas distancias', () => {
    const nodes = ['a', 'b', 'c'].map(makeNode)
    const edges = [makeEdge('a', 'b', 3), makeEdge('b', 'c', 4), makeEdge('a', 'c', 10)]
    const dist = floydWarshall(nodes, edges)
    expect(dist.get('a')!.get('c')).toBe(7)
    expect(dist.get('a')!.get('b')).toBe(3)
    expect(dist.get('b')!.get('c')).toBe(4)
  })

  it('infinito para pares desconexos', () => {
    const nodes = ['a', 'b'].map(makeNode)
    expect(floydWarshall(nodes, [])!.get('a')!.get('b')).toBe(Infinity)
  })
})

describe('tarjanScc', () => {
  it('detecta SCCs em grafo com ciclo', () => {
    const nodes = ['a', 'b', 'c'].map(makeNode)
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'a'), makeEdge('b', 'c')]
    const sccs = tarjanScc(nodes, edges)
    expect(sccs.length).toBeGreaterThanOrEqual(2)
    const cycle = sccs.find((s) => s.length > 1)
    expect(cycle).toBeDefined()
    expect(cycle!.map((n) => n.id).sort()).toEqual(['a', 'b'])
  })

  it('cada node em seu proprio SCC em DAG', () => {
    const nodes = ['a', 'b', 'c'].map(makeNode)
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')]
    const sccs = tarjanScc(nodes, edges)
    expect(sccs.length).toBe(3)
  })
})

describe('bfs', () => {
  it('percorre em ordem BFS', () => {
    const nodes = ['a', 'b', 'c', 'd'].map(makeNode)
    const edges = [makeEdge('a', 'b'), makeEdge('a', 'c'), makeEdge('b', 'd')]
    const order = bfs(nodes, edges, 'a')
    expect(order.map((n) => n.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('retorna so o node inicial para no isolado', () => {
    expect(bfs([makeNode('a')], [], 'a').map((n) => n.id)).toEqual(['a'])
  })
})

describe('dfs', () => {
  it('percorre em ordem DFS', () => {
    const nodes = ['a', 'b', 'c', 'd'].map(makeNode)
    const edges = [makeEdge('a', 'b'), makeEdge('a', 'c'), makeEdge('b', 'd')]
    const order = dfs(nodes, edges, 'a')
    expect(order.map((n) => n.id)).toEqual(['a', 'b', 'd', 'c'])
  })
})

describe('kruskalMst', () => {
  it('encontra MST com 3 nodes', () => {
    const nodes = ['a', 'b', 'c'].map(makeNode)
    const edges = [makeEdge('a', 'b', 1), makeEdge('b', 'c', 2), makeEdge('a', 'c', 3)]
    const mst = kruskalMst(nodes, edges)
    expect(mst.totalWeight).toBe(3)
    expect(mst.edges.length).toBe(2)
  })

  it('grafo desconexo nao forma MST completa', () => {
    const nodes = ['a', 'b', 'c'].map(makeNode)
    const mst = kruskalMst(nodes, [])
    expect(mst.edges.length).toBeLessThanOrEqual(1)
  })
})

describe('primMst', () => {
  it('encontra mesma MST que Kruskal', () => {
    const nodes = ['a', 'b', 'c'].map(makeNode)
    const edges = [makeEdge('a', 'b', 1), makeEdge('b', 'c', 2), makeEdge('a', 'c', 3)]
    const mst = primMst(nodes, edges, 'a')
    expect(mst.totalWeight).toBe(3)
    expect(mst.edges.length).toBe(2)
  })
})

describe('fordFulkerson', () => {
  it('calcula fluxo maximo', () => {
    const nodes = ['s', 'a', 'b', 't'].map(makeNode)
    const edges = [
      { ...makeEdge('s', 'a', 0), weight: 10 },
      { ...makeEdge('s', 'b', 0), weight: 5 },
      { ...makeEdge('a', 'b', 0), weight: 5 },
      { ...makeEdge('a', 't', 0), weight: 10 },
      { ...makeEdge('b', 't', 0), weight: 10 },
    ] as GraphEdge[]

    const flow = fordFulkerson(nodes, edges, 's', 't')
    expect(flow).toBe(15)
  })
})

describe('hungarian', () => {
  it('resolve assignment problem 3x3', () => {
    const cost = [
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ]
    const result = hungarian(cost)
    expect(result.totalCost).toBeGreaterThanOrEqual(0)
    expect(result.assignment.length).toBe(3)
    result.assignment.forEach(([row, col]) => {
      expect(row).toBeGreaterThanOrEqual(0)
      expect(col).toBeGreaterThanOrEqual(0)
    })
  })

  it('1x1 retorna unica tarefa', () => {
    const result = hungarian([[5]])
    expect(result.totalCost).toBe(5)
    expect(result.assignment).toEqual([[0, 0]])
  })
})

describe('pageRank', () => {
  it('converge e nodes com mais inc grau tem maior rank', () => {
    const nodes = ['h', 'a', 'b'].map(makeNode)
    const edges = [makeEdge('a', 'h'), makeEdge('b', 'h')]
    const pr = pageRank(nodes, edges)
    expect(pr.get('h')).toBeGreaterThan(pr.get('a')!)
    expect(pr.get('h')).toBeGreaterThan(pr.get('b')!)
  })

  it('soma dos ranks ~ 1', () => {
    const nodes = ['a', 'b'].map(makeNode)
    const edges = [makeEdge('a', 'b')]
    const pr = pageRank(nodes, edges)
    const sum = Array.from(pr.values()).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1, 1)
  })
})

describe('betweennessCentrality', () => {
  it('node central tem maior betweenness', () => {
    const nodes = ['a', 'b', 'c'].map(makeNode)
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')]
    const bc = betweennessCentrality(nodes, edges)
    expect(bc.get('b')!).toBeGreaterThan(bc.get('a')!)
    expect(bc.get('b')!).toBeGreaterThan(bc.get('c')!)
  })
})

describe('articulationPoints', () => {
  it('detecta ponto de articulacao', () => {
    const nodes = ['a', 'b', 'c'].map(makeNode)
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')]
    const aps = articulationPoints(nodes, edges)
    expect(aps.map((n) => n.id)).toEqual(['b'])
  })

  it('ciclo nao tem articulacao', () => {
    const nodes = ['a', 'b', 'c'].map(makeNode)
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c'), makeEdge('c', 'a')]
    expect(articulationPoints(nodes, edges)).toEqual([])
  })
})

describe('bridges', () => {
  it('detecta ponte', () => {
    const nodes = ['a', 'b', 'c'].map(makeNode)
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')]
    const br = bridges(nodes, edges)
    expect(br.length).toBe(2)
  })

  it('ciclo nao tem pontes', () => {
    const nodes = ['a', 'b', 'c'].map(makeNode)
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c'), makeEdge('c', 'a')]
    expect(bridges(nodes, edges)).toEqual([])
  })
})
