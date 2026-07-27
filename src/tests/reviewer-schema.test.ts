import { describe, it, expect } from 'vitest'
import { ReviewReadinessCheckSchema, ReviewReadinessReportSchema } from '../schemas/reviewer-schema.js'

describe('ReviewReadinessCheckSchema', () => {
  it('accepts a passing review check', () => {
    expect(
      ReviewReadinessCheckSchema.safeParse({
        name: 'Tests passing',
        passed: true,
        details: 'All 80 tests pass',
        severity: 'required',
      }).success,
    ).toBe(true)
  })
})

describe('ReviewReadinessReportSchema', () => {
  it('accepts a ready review report', () => {
    expect(
      ReviewReadinessReportSchema.safeParse({
        checks: [{ name: 'Lint', passed: true, details: 'No lint errors', severity: 'recommended' }],
        ready: true,
        score: 90,
        grade: 'A',
        summary: 'Ready for review',
      }).success,
    ).toBe(true)
  })

  it('rejects score < 0', () => {
    expect(
      ReviewReadinessReportSchema.safeParse({
        checks: [],
        ready: false,
        score: -1,
        grade: 'D',
        summary: 'nope',
      }).success,
    ).toBe(false)
  })
})
