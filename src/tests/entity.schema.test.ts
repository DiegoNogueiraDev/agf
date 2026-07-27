import { describe, it, expect } from 'vitest'
import { EntityTypeSchema, EntitySchema, EntityRelationSchema } from '../schemas/entity.schema.js'

describe('EntityTypeSchema', () => {
  it('accepts valid entity types', () => {
    for (const t of ['concept', 'technology', 'pattern', 'module', 'function', 'class', 'file']) {
      expect(EntityTypeSchema.safeParse(t).success).toBe(true)
    }
  })

  it('rejects unknown type', () => {
    expect(EntityTypeSchema.safeParse('database').success).toBe(false)
  })
})

describe('EntitySchema', () => {
  it('accepts a valid entity', () => {
    const result = EntitySchema.safeParse({
      id: 'ent-001',
      name: 'ZodSchema',
      type: 'class',
      normalizedName: 'zodschema',
      aliases: ['zod'],
      description: 'A Zod validation schema',
      mentionCount: 5,
      createdAt: '2026-06-22T00:00:00Z',
      updatedAt: '2026-06-22T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it('accepts null description', () => {
    const result = EntitySchema.safeParse({
      id: 'e',
      name: 'X',
      type: 'concept',
      normalizedName: 'x',
      aliases: [],
      description: null,
      mentionCount: 0,
      createdAt: 'ts',
      updatedAt: 'ts',
    })
    expect(result.success).toBe(true)
  })
})
