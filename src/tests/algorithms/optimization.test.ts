import { describe, it, expect } from 'vitest'
import {
  kmeansClustering,
  gradientDescent,
  multiplicativeWeights,
  setCover,
  tspNearestNeighbor,
  vertexCoverApprox,
  geneticAlgorithm,
  branchAndBound,
  backtrackingSolver,
  linearProgramming,
} from '../../core/algorithms/optimization.js'

describe('kmeansClustering', () => {
  it('separa dois clusters bem definidos', () => {
    const data = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [5, 5],
      [5, 6],
      [6, 5],
      [6, 6],
    ]
    const result = kmeansClustering(data, 2)
    expect(result.clusters.length).toBe(2)
    expect(result.clusters[0].length + result.clusters[1].length).toBe(8)
    expect(result.centroids.length).toBe(2)
    result.centroids.forEach((c) => expect(c.length).toBe(2))
    expect(result.assignments.length).toBe(8)
  })

  it('k=1 retorna um unico cluster', () => {
    const data = [
      [1, 2],
      [3, 4],
      [5, 6],
    ]
    const result = kmeansClustering(data, 1)
    expect(result.clusters.length).toBe(1)
    expect(result.clusters[0].length).toBe(3)
  })

  it('respeita maxIterations', () => {
    const data = [
      [0, 0],
      [0, 1],
      [1, 0],
      [5, 5],
      [5, 6],
      [6, 5],
    ]
    const result = kmeansClustering(data, 2, 1)
    expect(result.clusters.length).toBe(2)
  })
})

describe('gradientDescent', () => {
  it('minimiza f(x)=x^2', () => {
    const result = gradientDescent({
      costFn: (p: number[]) => p[0] * p[0],
      gradientFn: (p: number[]) => [2 * p[0]],
      initialParams: [10],
      learningRate: 0.1,
      iterations: 100,
    })
    expect(result.params[0]).toBeCloseTo(0, 1)
    expect(result.costHistory[result.costHistory.length - 1]).toBeLessThan(result.costHistory[0])
  })

  it('minimiza f(x,y)=x^2+y^2', () => {
    const result = gradientDescent({
      costFn: (p: number[]) => p[0] * p[0] + p[1] * p[1],
      gradientFn: (p: number[]) => [2 * p[0], 2 * p[1]],
      initialParams: [10, 5],
      learningRate: 0.1,
      iterations: 100,
    })
    expect(result.params[0]).toBeCloseTo(0, 1)
    expect(result.params[1]).toBeCloseTo(0, 1)
  })

  it('costHistory tem o numero correto de entradas', () => {
    const result = gradientDescent({
      costFn: (p: number[]) => p[0] * p[0],
      gradientFn: (p: number[]) => [2 * p[0]],
      initialParams: [5],
      learningRate: 0.05,
      iterations: 50,
    })
    expect(result.costHistory.length).toBe(50)
  })
})

describe('multiplicativeWeights', () => {
  it('expert 0 e melhor quando tem payoff consistentemente maior', () => {
    const payoffs = [
      [1, 0.5],
      [1, 0.5],
      [1, 0.5],
    ]
    const result = multiplicativeWeights(payoffs)
    expect(result.bestExpert).toBe(0)
    expect(result.weights.length).toBe(2)
    expect(result.regret).toBeGreaterThanOrEqual(0)
  })

  it('learning rate afeta a distribuicao final de pesos', () => {
    const payoffs = [
      [1, 0.5],
      [1, 0.5],
      [1, 0.5],
    ]
    const lowLr = multiplicativeWeights(payoffs, 0.01)
    const highLr = multiplicativeWeights(payoffs, 0.5)
    expect(lowLr.weights[0]).toBeGreaterThan(0)
    expect(highLr.weights[0]).toBeGreaterThan(lowLr.weights[0])
  })

  it('rounds limita o numero de rodadas', () => {
    const payoffs = [
      [1, 0.5],
      [1, 0.5],
      [1, 0.5],
      [1, 0.5],
      [1, 0.5],
    ]
    const result = multiplicativeWeights(payoffs, 0.1, 2)
    expect(result.bestExpert).toBe(0)
  })

  it('dois experts identicos geram pesos iguais', () => {
    const payoffs = [
      [0.5, 0.5],
      [0.5, 0.5],
    ]
    const result = multiplicativeWeights(payoffs, 0.1)
    expect(Math.abs(result.weights[0] - result.weights[1])).toBeLessThan(1e-10)
  })
})

describe('setCover', () => {
  it('cobre todos elementos do universo', () => {
    const universe = ['a', 'b', 'c', 'd', 'e', 'f']
    const subsets = new Map([
      ['s1', ['a', 'b']],
      ['s2', ['b', 'c', 'd']],
      ['s3', ['d', 'e', 'f']],
    ])
    const result = setCover(universe, subsets)
    expect(result.covered).toBe(6)
    expect(result.selected.length).toBeGreaterThan(0)
  })

  it('seleciona subconjuntos que cobrem todo universo', () => {
    const universe = ['a', 'b', 'c']
    const subsets = new Map([
      ['s1', ['a']],
      ['s2', ['b']],
      ['s3', ['c']],
    ])
    const result = setCover(universe, subsets)
    expect(result.selected).toEqual(['s1', 's2', 's3'])
    expect(result.covered).toBe(3)
  })

  it('universo vazio retorna selecao vazia', () => {
    const result = setCover([], new Map())
    expect(result.selected).toEqual([])
    expect(result.covered).toBe(0)
  })
})

describe('tspNearestNeighbor', () => {
  it('rota para 3 cidades forma triangulo', () => {
    const cities: [number, number][] = [
      [0, 0],
      [1, 0],
      [0, 1],
    ]
    const result = tspNearestNeighbor(cities)
    expect(result.route[0]).toBe(0)
    expect(result.route.length).toBe(3)
    expect(result.distance).toBeGreaterThan(0)
  })

  it('distancia calculada corretamente para 2 cidades', () => {
    const cities: [number, number][] = [
      [0, 0],
      [3, 4],
    ]
    const result = tspNearestNeighbor(cities)
    expect(result.route).toEqual([0, 1])
    expect(result.distance).toBeCloseTo(10, 5)
  })

  it('cidade unica tem distancia zero', () => {
    const cities: [number, number][] = [[0, 0]]
    const result = tspNearestNeighbor(cities)
    expect(result.route).toEqual([0])
    expect(result.distance).toBe(0)
  })
})

describe('vertexCoverApprox', () => {
  it('cobre todas arestas de um caminho', () => {
    const edges: [number, number][] = [
      [0, 1],
      [1, 2],
      [2, 3],
    ]
    const result = vertexCoverApprox(edges)
    for (const [u, v] of edges) {
      expect(result.vertices.has(u) || result.vertices.has(v)).toBe(true)
    }
    expect(result.size).toBeGreaterThanOrEqual(2)
  })

  it('aresta unica tem cobertura de 2 vertices', () => {
    const edges: [number, number][] = [[0, 1]]
    const result = vertexCoverApprox(edges)
    expect(result.vertices.has(0)).toBe(true)
    expect(result.vertices.has(1)).toBe(true)
    expect(result.size).toBe(2)
  })

  it('grafo vazio retorna cobertura vazia', () => {
    const result = vertexCoverApprox([])
    expect(result.size).toBe(0)
  })
})

describe('geneticAlgorithm', () => {
  it('encontra solucao factivel para mochila simples', () => {
    const tasks = [
      { id: 'a', effort: 2, value: 10 },
      { id: 'b', effort: 1, value: 8 },
      { id: 'c', effort: 3, value: 15 },
    ]
    const result = geneticAlgorithm({ tasks, maxEffort: 3, populationSize: 20, generations: 20 })
    const totalEffort = result.schedule.reduce((sum, id) => sum + tasks.find((t) => t.id === id)!.effort, 0)
    expect(totalEffort).toBeLessThanOrEqual(3)
    expect(result.totalValue).toBeGreaterThan(0)
    expect(result.generation).toBe(20)
  })

  it('nenhuma tarefa cabe quando maxEffort=0', () => {
    const tasks = [{ id: 'a', effort: 2, value: 10 }]
    const result = geneticAlgorithm({ tasks, maxEffort: 0 })
    expect(result.schedule).toEqual([])
    expect(result.totalValue).toBe(0)
  })
})

describe('branchAndBound', () => {
  it('resolve assignment 3x3', () => {
    const costMatrix = [
      [9, 2, 7],
      [6, 4, 3],
      [5, 8, 1],
    ]
    const result = branchAndBound(costMatrix)
    expect(result.totalCost).toBe(9)
    expect(result.assignment.length).toBe(3)
    expect(result.nodesVisited).toBeGreaterThan(0)
    const cols = result.assignment.map(([, c]) => c).sort((a, b) => a - b)
    expect(cols).toEqual([0, 1, 2])
    const rows = result.assignment.map(([r]) => r).sort((a, b) => a - b)
    expect(rows).toEqual([0, 1, 2])
  })

  it('matriz 1x1 retorna unica atribuicao', () => {
    const result = branchAndBound([[10]])
    expect(result.totalCost).toBe(10)
    expect(result.assignment).toEqual([[0, 0]])
    expect(result.nodesVisited).toBe(1)
  })
})

describe('backtrackingSolver', () => {
  it('encontra solucao para problema de coloracao simples', () => {
    const variables = ['WA', 'NT', 'Q']
    const domains = new Map([
      ['WA', ['R', 'G', 'B']],
      ['NT', ['R', 'G', 'B']],
      ['Q', ['R', 'G', 'B']],
    ])
    const constraints = [
      (a: Map<string, any>) => a.get('WA') === undefined || a.get('NT') === undefined || a.get('WA') !== a.get('NT'),
      (a: Map<string, any>) => a.get('NT') === undefined || a.get('Q') === undefined || a.get('NT') !== a.get('Q'),
    ]
    const result = backtrackingSolver({ variables, domains, constraints })
    expect(result.solution).not.toBeNull()
    expect(result.solution!.get('WA')).not.toBe(result.solution!.get('NT'))
    expect(result.solution!.get('NT')).not.toBe(result.solution!.get('Q'))
  })

  it('retorna null para problema impossivel', () => {
    const variables = ['x']
    const domains = new Map([['x', [1]]])
    const constraints = [(a: Map<string, any>) => a.get('x') !== a.get('x')]
    const result = backtrackingSolver({ variables, domains, constraints })
    expect(result.solution).toBeNull()
    expect(result.backtracks).toBeGreaterThan(0)
  })
})

describe('linearProgramming', () => {
  it('maximiza funcao linear 2D', () => {
    const result = linearProgramming({
      c: [1, 2],
      A: [[1, 1]],
      b: [1],
    })
    expect(result.feasible).toBe(true)
    expect(result.optimalValue).toBeCloseTo(2, 5)
    expect(result.x[0]).toBeGreaterThanOrEqual(0)
    expect(result.x[1]).toBeGreaterThanOrEqual(0)
  })

  it('detecta inviabilidade', () => {
    const result = linearProgramming({
      c: [1],
      A: [[1], [-1]],
      b: [1, -2],
    })
    expect(result.feasible).toBe(false)
  })

  it('otimo em extremidade de restricao', () => {
    const result = linearProgramming({
      c: [1, 0],
      A: [[1, 0]],
      b: [3],
    })
    expect(result.feasible).toBe(true)
    expect(result.optimalValue).toBeCloseTo(3, 5)
    expect(result.x[0]).toBeCloseTo(3, 5)
  })
})
