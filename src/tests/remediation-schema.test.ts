import { describe, it, expect } from 'vitest'
import {
  HarnessDimensionSchema,
  RemediationCategorySchema,
  ViolationDetailSchema,
  RemediationSuggestionSchema,
} from '../schemas/remediation-schema.js'

describe('HarnessDimensionSchema', () => {
  it('accepts all 7 dimensions', () => {
    for (const d of ['types', 'tests', 'naming', 'errors', 'context', 'docs', 'fitness']) {
      expect(HarnessDimensionSchema.safeParse(d).success).toBe(true)
    }
  })

  it('rejects unknown dimension', () => {
    expect(HarnessDimensionSchema.safeParse('security').success).toBe(false)
  })
})

describe('RemediationCategorySchema', () => {
  it('accepts valid categories', () => {
    for (const c of ['remove', 'replace', 'add', 'refactor']) {
      expect(RemediationCategorySchema.safeParse(c).success).toBe(true)
    }
  })
})

describe('ViolationDetailSchema', () => {
  it('accepts a valid violation', () => {
    const result = ViolationDetailSchema.safeParse({
      file: 'src/core/foo.ts',
      line: 42,
      dimension: 'types',
      violationType: 'any_usage',
      evidence: 'const x: any',
      confidence: 0.95,
    })
    expect(result.success).toBe(true)
  })

  it('rejects line < 1', () => {
    expect(
      ViolationDetailSchema.safeParse({
        file: 'src/x.ts',
        line: 0,
        dimension: 'tests',
        violationType: 'missing_test',
        evidence: '',
        confidence: 1.0,
      }).success,
    ).toBe(false)
  })

  it('rejects confidence > 1', () => {
    expect(
      ViolationDetailSchema.safeParse({
        file: 'x.ts',
        line: 1,
        dimension: 'naming',
        violationType: 'bad_name',
        evidence: 'x',
        confidence: 1.1,
      }).success,
    ).toBe(false)
  })
})
