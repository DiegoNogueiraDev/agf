import { describe, it, expect } from 'vitest'
import { DeployReadinessCheckSchema, DeployReadinessReportSchema } from '../schemas/deployer-schema.js'

describe('DeployReadinessCheckSchema', () => {
  it('accepts a passing check', () => {
    const result = DeployReadinessCheckSchema.safeParse({
      name: 'Tests passing',
      passed: true,
      details: 'All 152 tests pass',
      severity: 'required',
    })
    expect(result.success).toBe(true)
  })

  it('accepts a failing check', () => {
    expect(
      DeployReadinessCheckSchema.safeParse({
        name: 'Harness score ≥ 70',
        passed: false,
        details: 'Score is 62, need ≥ 70',
        severity: 'required',
      }).success,
    ).toBe(true)
  })
})

describe('DeployReadinessReportSchema', () => {
  it('accepts a ready report', () => {
    expect(
      DeployReadinessReportSchema.safeParse({
        checks: [{ name: 'Build', passed: true, details: 'OK', severity: 'required' }],
        ready: true,
        score: 95,
        grade: 'A',
        summary: 'Ready to deploy',
      }).success,
    ).toBe(true)
  })

  it('rejects score > 100', () => {
    expect(
      DeployReadinessReportSchema.safeParse({
        checks: [],
        ready: false,
        score: 101,
        grade: 'D',
        summary: '',
      }).success,
    ).toBe(false)
  })
})
