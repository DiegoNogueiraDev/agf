import { describe, it, expect } from 'vitest'
import {
  DoneIntegrityIssueTypeSchema,
  DoneIntegrityIssueSchema,
  DoneIntegrityReportSchema,
  StatusFlowReportSchema,
} from '../schemas/validator-schema.js'

describe('DoneIntegrityIssueTypeSchema', () => {
  it('accepts valid issue types', () => {
    for (const t of ['blocked_but_done', 'dependency_not_done']) {
      expect(DoneIntegrityIssueTypeSchema.safeParse(t).success).toBe(true)
    }
  })

  it('rejects unknown type', () => {
    expect(DoneIntegrityIssueTypeSchema.safeParse('orphan').success).toBe(false)
  })
})

describe('DoneIntegrityIssueSchema', () => {
  it('accepts a valid issue', () => {
    expect(
      DoneIntegrityIssueSchema.safeParse({
        nodeId: 'node_abc',
        title: 'Implement X',
        issueType: 'dependency_not_done',
        details: 'Dependency node_def is still in progress',
      }).success,
    ).toBe(true)
  })
})

describe('DoneIntegrityReportSchema', () => {
  it('accepts a passing report', () => {
    expect(
      DoneIntegrityReportSchema.safeParse({
        issues: [],
        passed: true,
      }).success,
    ).toBe(true)
  })
})

describe('StatusFlowReportSchema', () => {
  it('accepts a compliance report', () => {
    expect(
      StatusFlowReportSchema.safeParse({
        violations: [],
        complianceRate: 100,
      }).success,
    ).toBe(true)
  })
})
