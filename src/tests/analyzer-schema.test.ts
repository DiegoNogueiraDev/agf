import { describe, it, expect } from 'vitest'
import { SectionQualitySchema, PrdQualitySectionSchema } from '../schemas/analyzer-schema.js'

describe('SectionQualitySchema', () => {
  it('accepts all quality levels', () => {
    for (const q of ['missing', 'weak', 'adequate', 'strong']) {
      expect(SectionQualitySchema.safeParse(q).success).toBe(true)
    }
  })

  it('rejects unknown quality', () => {
    expect(SectionQualitySchema.safeParse('excellent').success).toBe(false)
  })
})

describe('PrdQualitySectionSchema', () => {
  it('accepts a valid quality section', () => {
    const result = PrdQualitySectionSchema.safeParse({
      name: 'Problem Statement',
      quality: 'strong',
      issues: [],
      suggestions: ['Add more detail'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts section with multiple issues', () => {
    expect(
      PrdQualitySectionSchema.safeParse({
        name: 'Objectives',
        quality: 'weak',
        issues: ['No measurable goals', 'Missing KPIs'],
        suggestions: [],
      }).success,
    ).toBe(true)
  })
})
