import { describe, it, expect } from 'vitest'
import {
  KnowledgeSourceTypeSchema,
  KnowledgeRelationTypeSchema,
  KnowledgeUsageActionSchema,
} from '../schemas/knowledge.schema.js'

describe('KnowledgeSourceTypeSchema', () => {
  it('accepts standard source types', () => {
    for (const t of ['upload', 'serena', 'memory', 'code_context', 'docs']) {
      expect(KnowledgeSourceTypeSchema.safeParse(t).success).toBe(true)
    }
  })

  it('rejects unknown source type', () => {
    expect(KnowledgeSourceTypeSchema.safeParse('database').success).toBe(false)
  })
})

describe('KnowledgeRelationTypeSchema', () => {
  it('accepts all relation types', () => {
    for (const t of ['related_to', 'derived_from', 'supersedes', 'contradicts']) {
      expect(KnowledgeRelationTypeSchema.safeParse(t).success).toBe(true)
    }
  })

  it('rejects unknown relation', () => {
    expect(KnowledgeRelationTypeSchema.safeParse('depends_on').success).toBe(false)
  })
})

describe('KnowledgeUsageActionSchema', () => {
  it('accepts all usage actions', () => {
    for (const a of ['retrieved', 'helpful', 'unhelpful', 'outdated']) {
      expect(KnowledgeUsageActionSchema.safeParse(a).success).toBe(true)
    }
  })
})
