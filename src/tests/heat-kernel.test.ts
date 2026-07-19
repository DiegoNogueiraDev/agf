/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { heatKernelRelevance } from '../core/context/heat-kernel.js'

// Path graph: a — b — c — d, plus an isolated node z.
const graph = {
  nodes: ['a', 'b', 'c', 'd', 'z'],
  edges: [
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'd'],
  ] as Array<[string, string]>,
}

describe('heatKernelRelevance (graph Laplacian e^{-tL} diffusion)', () => {
  it('gives the seed the highest relevance', () => {
    const r = heatKernelRelevance(graph, 'a', { t: 0.5 })
    expect(r.a).toBeGreaterThan(r.b)
    expect(r.a).toBeGreaterThan(r.c)
  })

  it('ranks a direct neighbour above a 2-hop node', () => {
    const r = heatKernelRelevance(graph, 'a', { t: 0.5 })
    expect(r.b).toBeGreaterThan(r.c)
    expect(r.c).toBeGreaterThan(r.d)
  })

  it('spreads more heat to neighbours as t (diffusion time) grows', () => {
    const small = heatKernelRelevance(graph, 'a', { t: 0.2 })
    const large = heatKernelRelevance(graph, 'a', { t: 1.2 })
    expect(large.b).toBeGreaterThan(small.b)
  })

  it('leaves a disconnected node with ~zero relevance', () => {
    const r = heatKernelRelevance(graph, 'a', { t: 1.0 })
    expect(r.z).toBeCloseTo(0, 6)
  })

  it('at t→0 essentially only the seed is warm', () => {
    const r = heatKernelRelevance(graph, 'a', { t: 0.001 })
    expect(r.a).toBeGreaterThan(0.99)
    expect(r.b).toBeLessThan(0.01)
  })

  it('throws when the seed is not in the graph', () => {
    expect(() => heatKernelRelevance(graph, 'missing', { t: 0.5 })).toThrow()
  })
})
