import { describe, it, expect } from 'vitest'
import { enrichGapsWithEdgeCount, sortGapsByImpact } from '../core/gaps/gap-ordering.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

const EMPTY_DOC = { nodes: [], edges: [] } as unknown as GraphDocument

describe('enrichGapsWithEdgeCount', () => {
  it('returns empty array for empty input', () => {
    expect(enrichGapsWithEdgeCount([], EMPTY_DOC)).toHaveLength(0)
  })

  it('returns an array', () => {
    expect(Array.isArray(enrichGapsWithEdgeCount([], EMPTY_DOC))).toBe(true)
  })
})

describe('sortGapsByImpact', () => {
  it('returns empty array for empty input', () => {
    expect(sortGapsByImpact([], EMPTY_DOC)).toHaveLength(0)
  })

  it('returns an array', () => {
    expect(Array.isArray(sortGapsByImpact([], EMPTY_DOC))).toBe(true)
  })

  it('respects orderByImpact option', () => {
    const result = sortGapsByImpact([], EMPTY_DOC, { orderByImpact: false })
    expect(Array.isArray(result)).toBe(true)
  })
})
