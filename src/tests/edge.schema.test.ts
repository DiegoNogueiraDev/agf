import { describe, it, expect } from 'vitest'
import { RelationTypeSchema, GraphEdgeSchema } from '../schemas/edge.schema.js'

describe('RelationTypeSchema', () => {
  it('accepts standard relations', () => {
    for (const r of ['parent_of', 'depends_on', 'blocks', 'implements', 'tests']) {
      expect(RelationTypeSchema.safeParse(r).success).toBe(true)
    }
  })

  it('rejects unknown relation', () => {
    expect(RelationTypeSchema.safeParse('influences').success).toBe(false)
  })
})

describe('GraphEdgeSchema', () => {
  it('accepts a valid edge', () => {
    const result = GraphEdgeSchema.safeParse({
      id: 'edge-001',
      from: 'node-a',
      to: 'node-b',
      relationType: 'depends_on',
      createdAt: '2026-06-22T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it('accepts optional weight in [0,1]', () => {
    expect(
      GraphEdgeSchema.safeParse({
        id: 'e2',
        from: 'a',
        to: 'b',
        relationType: 'implements',
        weight: 0.8,
        createdAt: 'ts',
      }).success,
    ).toBe(true)
  })

  it('rejects weight > 1', () => {
    expect(
      GraphEdgeSchema.safeParse({
        id: 'e3',
        from: 'a',
        to: 'b',
        relationType: 'blocks',
        weight: 1.5,
        createdAt: 'ts',
      }).success,
    ).toBe(false)
  })

  it('rejects id longer than 100 chars', () => {
    expect(
      GraphEdgeSchema.safeParse({
        id: 'x'.repeat(101),
        from: 'a',
        to: 'b',
        relationType: 'related_to',
        createdAt: 'ts',
      }).success,
    ).toBe(false)
  })
})
