import { describe, it, expect } from 'vitest'
import {
  AcFormatSchema,
  GwtStepSchema,
  ParsedAcSchema,
  InvestCheckSchema,
  AcNodeReportSchema,
  AcQualityReportSchema,
} from '../schemas/ac-quality-schema.js'

describe('AcFormatSchema', () => {
  it('accepts valid formats', () => {
    for (const f of ['gwt', 'free_text', 'checklist']) {
      expect(AcFormatSchema.safeParse(f).success).toBe(true)
    }
  })

  it('rejects unknown format', () => {
    expect(AcFormatSchema.safeParse('bullet').success).toBe(false)
  })
})

describe('GwtStepSchema', () => {
  it('accepts valid step', () => {
    expect(GwtStepSchema.safeParse({ keyword: 'Given', text: 'a user exists' }).success).toBe(true)
  })

  it('rejects missing fields', () => {
    expect(GwtStepSchema.safeParse({ keyword: 'Given' }).success).toBe(false)
  })
})

describe('ParsedAcSchema', () => {
  it('accepts a free-text AC', () => {
    const result = ParsedAcSchema.safeParse({
      raw: 'The endpoint returns 200',
      format: 'free_text',
      isTestable: true,
      isMeasurable: false,
    })
    expect(result.success).toBe(true)
  })

  it('accepts gwt AC with steps', () => {
    const result = ParsedAcSchema.safeParse({
      raw: 'Given X when Y then Z',
      format: 'gwt',
      steps: [{ keyword: 'Given', text: 'X' }],
      isTestable: true,
      isMeasurable: true,
    })
    expect(result.success).toBe(true)
  })
})

describe('AcQualityReportSchema', () => {
  it('accepts a valid report', () => {
    const result = AcQualityReportSchema.safeParse({
      nodes: [],
      overallScore: 85,
      summary: 'All good',
    })
    expect(result.success).toBe(true)
  })

  it('rejects score > 100', () => {
    expect(AcQualityReportSchema.safeParse({ nodes: [], overallScore: 101, summary: 'x' }).success).toBe(false)
  })
})
