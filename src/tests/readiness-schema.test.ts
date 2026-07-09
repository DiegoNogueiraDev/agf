import { describe, it, expect } from 'vitest'
import {
  BaseReadinessCheckSchema,
  BaseReadinessReportSchema,
  ReadinessSeveritySchema,
} from '../schemas/readiness-schema.js'

describe('ReadinessSeveritySchema', () => {
  it('accepts required and recommended', () => {
    expect(ReadinessSeveritySchema.safeParse('required').success).toBe(true)
    expect(ReadinessSeveritySchema.safeParse('recommended').success).toBe(true)
  })

  it('rejects other strings', () => {
    expect(ReadinessSeveritySchema.safeParse('optional').success).toBe(false)
  })
})

describe('BaseReadinessCheckSchema', () => {
  it('accepts a valid check', () => {
    const result = BaseReadinessCheckSchema.safeParse({
      name: 'Tests pass',
      passed: true,
      details: 'All 100 tests green',
      severity: 'required',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing fields', () => {
    expect(BaseReadinessCheckSchema.safeParse({ name: 'x', passed: true }).success).toBe(false)
  })
})

describe('BaseReadinessReportSchema', () => {
  it('accepts a valid report', () => {
    const result = BaseReadinessReportSchema.safeParse({
      checks: [],
      ready: true,
      score: 95,
      grade: 'A',
      summary: 'All checks passed',
    })
    expect(result.success).toBe(true)
  })

  it('rejects score out of range', () => {
    expect(
      BaseReadinessReportSchema.safeParse({
        checks: [],
        ready: true,
        score: 101,
        grade: 'A',
        summary: 'x',
      }).success,
    ).toBe(false)
  })
})
