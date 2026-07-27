/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { computeProvenanceBackfill, type BackfillInput } from '../core/harness/provenance-backfill.js'

describe('provenance-backfill', () => {
  const makeInput = (overrides: Partial<BackfillInput> = {}): BackfillInput => ({
    nodes: [
      { id: 'n1', sourceFile: 'prd.md' },
      { id: 'n2', sourceFile: null },
      { id: 'n3', sourceFile: null },
    ],
    edges: [
      { fromNode: 'n1', toNode: 'n2', relationType: 'parent_of' },
      { fromNode: 'n2', toNode: 'n3', relationType: 'parent_of' },
    ],
    ...overrides,
  })

  it('should skip nodes that already have sourceFile', () => {
    const result = computeProvenanceBackfill(makeInput())
    expect(result.find((u) => u.nodeId === 'n1')).toBeUndefined()
  })

  it('should inherit sourceFile from immediate parent', () => {
    const result = computeProvenanceBackfill(makeInput())
    const update = result.find((u) => u.nodeId === 'n2')
    expect(update).toBeDefined()
    expect(update!.sourceFile).toBe('prd.md')
    expect(update!.inheritedFrom).toBe('n1')
  })

  it('should propagate through chain of parent_of edges', () => {
    const result = computeProvenanceBackfill(makeInput())
    const update = result.find((u) => u.nodeId === 'n3')
    expect(update).toBeDefined()
    expect(update!.sourceFile).toBe('prd.md')
    expect(update!.inheritedFrom).toBe('n1')
  })

  it('should return empty array when all nodes have sourceFile', () => {
    const result = computeProvenanceBackfill({
      nodes: [
        { id: 'n1', sourceFile: 'a.md' },
        { id: 'n2', sourceFile: 'b.md' },
      ],
      edges: [],
    })
    expect(result).toEqual([])
  })

  it('should respect maxDepth parameter', () => {
    const nodes = [
      { id: 'n1', sourceFile: 'root.md' },
      { id: 'n2', sourceFile: null },
      { id: 'n3', sourceFile: null },
      { id: 'n4', sourceFile: null },
    ]
    const edges = [
      { fromNode: 'n1', toNode: 'n2', relationType: 'parent_of' },
      { fromNode: 'n2', toNode: 'n3', relationType: 'parent_of' },
      { fromNode: 'n3', toNode: 'n4', relationType: 'parent_of' },
    ]
    const result = computeProvenanceBackfill({ nodes, edges, maxDepth: 2 })
    expect(result.find((u) => u.nodeId === 'n2')).toBeDefined()
    expect(result.find((u) => u.nodeId === 'n3')).toBeDefined()
    expect(result.find((u) => u.nodeId === 'n4')).toBeUndefined()
  })

  it('should stop at cycle to avoid infinite loop when no ancestor has sourceFile', () => {
    const result = computeProvenanceBackfill({
      nodes: [
        { id: 'n1', sourceFile: null },
        { id: 'n2', sourceFile: null },
        { id: 'n3', sourceFile: null },
      ],
      edges: [
        { fromNode: 'n1', toNode: 'n2', relationType: 'parent_of' },
        { fromNode: 'n2', toNode: 'n3', relationType: 'parent_of' },
        { fromNode: 'n3', toNode: 'n1', relationType: 'parent_of' },
      ],
    })
    expect(result).toEqual([])
  })

  it('should only traverse parent_of edges', () => {
    const result = computeProvenanceBackfill({
      nodes: [
        { id: 'n1', sourceFile: 'root.md' },
        { id: 'n2', sourceFile: null },
      ],
      edges: [{ fromNode: 'n1', toNode: 'n2', relationType: 'depends_on' }],
    })
    expect(result).toEqual([])
  })

  it('should return no updates when no ancestor has sourceFile', () => {
    const result = computeProvenanceBackfill({
      nodes: [
        { id: 'n1', sourceFile: null },
        { id: 'n2', sourceFile: null },
      ],
      edges: [{ fromNode: 'n1', toNode: 'n2', relationType: 'parent_of' }],
    })
    expect(result).toEqual([])
  })
})
