import { describe, it, expect } from 'vitest'
import {
  AdrValidationResultSchema,
  AdrReportSchema,
  TraceabilityCoverageSchema,
  TraceabilityEntrySchema,
} from '../schemas/designer-schema.js'

describe('AdrValidationResultSchema', () => {
  it('accepts a fully valid ADR result', () => {
    const result = AdrValidationResultSchema.safeParse({
      nodeId: 'node_adr1',
      title: 'Use SQLite for persistence',
      grade: 'A',
      hasStatus: true,
      hasContext: true,
      hasDecision: true,
      hasConsequences: true,
      missingFields: [],
    })
    expect(result.success).toBe(true)
  })

  it('accepts an incomplete ADR', () => {
    expect(
      AdrValidationResultSchema.safeParse({
        nodeId: 'node_adr2',
        title: 'Incomplete ADR',
        grade: 'D',
        hasStatus: false,
        hasContext: false,
        hasDecision: true,
        hasConsequences: false,
        missingFields: ['status', 'context', 'consequences'],
      }).success,
    ).toBe(true)
  })
})

describe('AdrReportSchema', () => {
  it('accepts a valid ADR report', () => {
    expect(
      AdrReportSchema.safeParse({
        decisions: [],
        overallGrade: 'B',
        summary: 'No ADRs found',
      }).success,
    ).toBe(true)
  })
})

describe('TraceabilityCoverageSchema', () => {
  it('accepts all coverage values', () => {
    for (const c of ['full', 'partial', 'none']) {
      expect(TraceabilityCoverageSchema.safeParse(c).success).toBe(true)
    }
  })
})

describe('TraceabilityEntrySchema', () => {
  it('accepts a valid traceability entry', () => {
    expect(
      TraceabilityEntrySchema.safeParse({
        requirementId: 'req-001',
        linkedDecisions: ['node_adr1'],
        linkedConstraints: [],
        coverage: 'partial',
      }).success,
    ).toBe(true)
  })
})
