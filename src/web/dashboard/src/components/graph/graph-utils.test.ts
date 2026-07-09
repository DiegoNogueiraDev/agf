/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { computeLayoutKey, shouldSkipLayout, applyGridLayout, repairElkInput } from './graph-utils'
import type { ElkGraph } from './graph-utils'
import type { Node, Edge } from '@xyflow/react'

describe('computeLayoutKey', () => {
  it('returns the same key for identical inputs', () => {
    const a = computeLayoutKey(['n1', 'n2'], ['n1-n2'], 'TB')
    const b = computeLayoutKey(['n1', 'n2'], ['n1-n2'], 'TB')
    expect(a).toBe(b)
  })

  it('returns a different key when direction changes', () => {
    const tb = computeLayoutKey(['n1', 'n2'], ['n1-n2'], 'TB')
    const lr = computeLayoutKey(['n1', 'n2'], ['n1-n2'], 'LR')
    expect(tb).not.toBe(lr)
  })

  it('returns a different key when node ids change', () => {
    const a = computeLayoutKey(['n1', 'n2'], [], 'TB')
    const b = computeLayoutKey(['n1', 'n3'], [], 'TB')
    expect(a).not.toBe(b)
  })
})

describe('shouldSkipLayout', () => {
  it('returns false when prevIds is null (first layout)', () => {
    expect(shouldSkipLayout(null, ['n1'])).toBe(false)
  })

  it('returns false when lengths differ', () => {
    expect(shouldSkipLayout(['n1'], ['n1', 'n2'])).toBe(false)
  })

  it('returns false when any id differs', () => {
    expect(shouldSkipLayout(['n1', 'n2'], ['n1', 'n3'])).toBe(false)
  })

  it('returns true when ids are identical in order', () => {
    expect(shouldSkipLayout(['n1', 'n2'], ['n1', 'n2'])).toBe(true)
  })
})

describe('applyGridLayout', () => {
  it('positions nodes in a grid with roughly sqrt(n) columns', () => {
    const nodes = Array.from({ length: 4 }, (_, i) => ({ id: `n${i}`, position: { x: 0, y: 0 }, data: {} })) as Node[]
    const result = applyGridLayout(nodes, [])
    expect(result.nodes).toHaveLength(4)
    // 4 nodes -> 2 columns: n0,n1 in row 0; n2,n3 in row 1
    expect(result.nodes[0].position.y).toBe(result.nodes[1].position.y)
    expect(result.nodes[2].position.y).toBeGreaterThan(result.nodes[0].position.y)
  })

  it('caps columns at 8 for very large node sets', () => {
    const nodes = Array.from({ length: 100 }, (_, i) => ({ id: `n${i}`, position: { x: 0, y: 0 }, data: {} })) as Node[]
    const result = applyGridLayout(nodes, [])
    const xs = new Set(result.nodes.slice(0, 8).map((n) => n.position.x))
    expect(xs.size).toBeLessThanOrEqual(8)
  })

  it('passes edges through unchanged', () => {
    const edges = [{ id: 'e1', source: 'a', target: 'b' }] as Edge[]
    const result = applyGridLayout([], edges)
    expect(result.edges).toBe(edges)
  })
})

describe('repairElkInput', () => {
  function baseGraph(overrides: Partial<ElkGraph> = {}): ElkGraph {
    return { id: 'root', children: [], edges: [], ...overrides }
  }

  it('fills missing width/height with defaults and reports it', () => {
    const graph = baseGraph({ children: [{ id: 'a' }] })
    const { input, issues } = repairElkInput(graph)
    expect(input.children[0].width).toBeGreaterThan(0)
    expect(input.children[0].height).toBeGreaterThan(0)
    expect(issues.some((i) => i.includes('default dimensions'))).toBe(true)
  })

  it('deduplicates children with the same id and reports it', () => {
    const graph = baseGraph({
      children: [
        { id: 'a', width: 10, height: 10 },
        { id: 'a', width: 10, height: 10 },
      ],
    })
    const { input, issues } = repairElkInput(graph)
    expect(input.children).toHaveLength(1)
    expect(issues.some((i) => i.includes('duplicate child'))).toBe(true)
  })

  it('drops edges referencing nonexistent nodes and reports it', () => {
    const graph = baseGraph({
      children: [{ id: 'a', width: 10, height: 10 }],
      edges: [{ id: 'e1', sources: ['a'], targets: ['ghost'] }],
    })
    const { input, issues } = repairElkInput(graph)
    expect(input.edges).toHaveLength(0)
    expect(issues.some((i) => i.includes('orphan edge'))).toBe(true)
  })

  it('returns no issues for an already-clean graph', () => {
    const graph = baseGraph({
      children: [
        { id: 'a', width: 10, height: 10 },
        { id: 'b', width: 10, height: 10 },
      ],
      edges: [{ id: 'e1', sources: ['a'], targets: ['b'] }],
    })
    const { issues } = repairElkInput(graph)
    expect(issues).toHaveLength(0)
  })
})
