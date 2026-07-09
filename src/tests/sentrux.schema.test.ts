import { describe, it, expect } from 'vitest'
import {
  SentruxScanResultSchema,
  SentruxViolationSchema,
  SentruxCheckRulesResultSchema,
} from '../schemas/sentrux.schema.js'

describe('SentruxScanResultSchema', () => {
  it('accepts a clean scan', () => {
    expect(
      SentruxScanResultSchema.safeParse({
        runId: 'scan-001',
        issuesFound: 0,
        severity: 'ok',
        timestamp: '2026-06-22T00:00:00Z',
      }).success,
    ).toBe(true)
  })

  it('accepts scan with issues', () => {
    expect(
      SentruxScanResultSchema.safeParse({
        runId: 'scan-002',
        issuesFound: 5,
        severity: 'error',
        timestamp: '2026-06-22T00:00:00Z',
      }).success,
    ).toBe(true)
  })

  it('rejects negative issue count', () => {
    expect(
      SentruxScanResultSchema.safeParse({
        runId: 's',
        issuesFound: -1,
        severity: 'ok',
        timestamp: 'ts',
      }).success,
    ).toBe(false)
  })
})

describe('SentruxViolationSchema', () => {
  it('accepts a valid violation', () => {
    expect(
      SentruxViolationSchema.safeParse({
        path: 'src/core/foo.ts',
        rule: 'no-any',
        severity: 'error',
      }).success,
    ).toBe(true)
  })

  it('rejects invalid severity', () => {
    expect(
      SentruxViolationSchema.safeParse({
        path: 'x',
        rule: 'r',
        severity: 'critical',
      }).success,
    ).toBe(false)
  })
})

describe('SentruxCheckRulesResultSchema', () => {
  it('accepts empty violations', () => {
    expect(
      SentruxCheckRulesResultSchema.safeParse({
        violations: [],
        totalCount: 0,
      }).success,
    ).toBe(true)
  })
})
