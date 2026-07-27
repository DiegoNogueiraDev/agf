import { describe, it, expect } from 'vitest'
import {
  DodCheckSchema,
  ImplementDoneReportSchema,
  SuggestedTestTypeSchema,
  TddCheckReportSchema,
} from '../schemas/implementer-schema.js'

describe('DodCheckSchema', () => {
  it('accepts a passing check', () => {
    expect(
      DodCheckSchema.safeParse({
        name: 'Has acceptance criteria',
        passed: true,
        details: 'AC found in description',
        severity: 'required',
      }).success,
    ).toBe(true)
  })

  it('accepts a failing check with fix', () => {
    expect(
      DodCheckSchema.safeParse({
        name: 'Tests pass',
        passed: false,
        details: '3 failing tests',
        severity: 'required',
        fix: 'Run npm run test:blast to identify failures',
      }).success,
    ).toBe(true)
  })
})

describe('ImplementDoneReportSchema', () => {
  it('accepts a ready done report', () => {
    expect(
      ImplementDoneReportSchema.safeParse({
        nodeId: 'node_abc',
        title: 'Implement feature X',
        checks: [],
        ready: true,
        score: 88,
        grade: 'B',
        summary: 'All required checks pass',
      }).success,
    ).toBe(true)
  })
})

describe('SuggestedTestTypeSchema', () => {
  it('accepts unit, integration, e2e', () => {
    for (const t of ['unit', 'integration', 'e2e']) {
      expect(SuggestedTestTypeSchema.safeParse(t).success).toBe(true)
    }
  })
})

describe('TddCheckReportSchema', () => {
  it('accepts an empty TDD report', () => {
    expect(
      TddCheckReportSchema.safeParse({
        tasks: [],
        overallTestability: 0,
        tasksAtRisk: 0,
        suggestedTestSpecs: [],
        summary: 'No tasks analyzed',
      }).success,
    ).toBe(true)
  })
})
