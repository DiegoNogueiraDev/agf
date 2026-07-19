import { describe, it, expect } from 'vitest'
import { GraphIndexesSchema, GraphProjectSchema } from '../schemas/graph.schema.js'

describe('GraphIndexesSchema', () => {
  it('accepts empty indexes', () => {
    const result = GraphIndexesSchema.safeParse({
      byId: {},
      childrenByParent: {},
      incomingByNode: {},
      outgoingByNode: {},
    })
    expect(result.success).toBe(true)
  })

  it('accepts populated indexes', () => {
    expect(
      GraphIndexesSchema.safeParse({
        byId: { node_abc: 0, node_def: 1 },
        childrenByParent: { node_abc: ['node_def'] },
        incomingByNode: { node_def: ['node_abc'] },
        outgoingByNode: { node_abc: ['node_def'] },
      }).success,
    ).toBe(true)
  })
})

describe('GraphProjectSchema', () => {
  it('accepts a minimal project', () => {
    expect(
      GraphProjectSchema.safeParse({
        id: 'proj-001',
        name: 'My Project',
        createdAt: '2026-06-22T00:00:00Z',
        updatedAt: '2026-06-22T00:00:00Z',
      }).success,
    ).toBe(true)
  })
})
