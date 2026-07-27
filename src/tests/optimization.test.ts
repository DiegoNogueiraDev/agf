import { describe, it, expect } from 'vitest'
import { kmeansClustering, setCover, tspNearestNeighbor, vertexCoverApprox } from '../core/algorithms/optimization.js'

describe('kmeansClustering', () => {
  it('returns k clusters for k=2', () => {
    const data = [
      [1, 1],
      [1, 2],
      [9, 9],
      [9, 10],
    ]
    const result = kmeansClustering(data, 2)
    expect(result.clusters.length).toBe(2)
    expect(result.centroids.length).toBe(2)
    expect(result.assignments.length).toBe(4)
  })

  it('assignments length equals data length', () => {
    const data = [
      [0, 0],
      [10, 10],
    ]
    const result = kmeansClustering(data, 2)
    expect(result.assignments.length).toBe(data.length)
  })

  it('assigns all points to cluster 0 when k=1', () => {
    const data = [
      [1, 2],
      [3, 4],
      [5, 6],
    ]
    const result = kmeansClustering(data, 1)
    expect(result.assignments.every((a) => a === 0)).toBe(true)
  })
})

describe('setCover (Map-based API)', () => {
  it('covers all elements using a Map of subsets', () => {
    const universe = ['1', '2', '3', '4', '5']
    const subsets = new Map([
      ['A', ['1', '2', '3']],
      ['B', ['3', '4']],
      ['C', ['4', '5']],
    ])
    const result = setCover(universe, subsets)
    expect(result.covered).toBe(universe.length)
    expect(result.selected.length).toBeGreaterThan(0)
  })

  it('returns covered=0 for empty universe', () => {
    const result = setCover([], new Map())
    expect(result.covered).toBe(0)
  })
})

describe('tspNearestNeighbor', () => {
  it('returns a route visiting all cities', () => {
    const cities: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
    const result = tspNearestNeighbor(cities)
    expect(result.route.length).toBe(cities.length)
  })

  it('returns 0 distance for a single city', () => {
    const result = tspNearestNeighbor([[0, 0]])
    expect(result.distance).toBe(0)
  })

  it('total distance is positive for multiple cities', () => {
    const cities: [number, number][] = [
      [0, 0],
      [3, 4],
      [6, 0],
    ]
    const result = tspNearestNeighbor(cities)
    expect(result.distance).toBeGreaterThan(0)
  })
})

describe('vertexCoverApprox', () => {
  it('returns a vertex cover that covers all edges', () => {
    const edges: [number, number][] = [
      [0, 1],
      [1, 2],
      [2, 3],
    ]
    const result = vertexCoverApprox(edges)
    for (const [u, v] of edges) {
      expect(result.vertices.has(u) || result.vertices.has(v)).toBe(true)
    }
  })

  it('returns empty cover for graph with no edges', () => {
    const result = vertexCoverApprox([])
    expect(result.size).toBe(0)
  })
})
