import { describe, it, expect } from 'vitest'
import { DocCompletenessReportSchema, DocCompletenessNodeSchema } from '../schemas/handoff-schema.js'

describe('DocCompletenessNodeSchema', () => {
  it('accepts a valid node reference', () => {
    expect(
      DocCompletenessNodeSchema.safeParse({
        nodeId: 'node_abc',
        title: 'Implement feature X',
      }).success,
    ).toBe(true)
  })
})

describe('DocCompletenessReportSchema', () => {
  it('accepts a fully documented report', () => {
    const result = DocCompletenessReportSchema.safeParse({
      descriptionsPresent: 10,
      totalNodes: 10,
      coverageRate: 100,
      nodesWithoutDescription: [],
    })
    expect(result.success).toBe(true)
  })

  it('accepts a partial report', () => {
    expect(
      DocCompletenessReportSchema.safeParse({
        descriptionsPresent: 7,
        totalNodes: 10,
        coverageRate: 70,
        nodesWithoutDescription: [{ nodeId: 'node_x', title: 'Missing description node' }],
      }).success,
    ).toBe(true)
  })

  it('rejects coverageRate > 100', () => {
    expect(
      DocCompletenessReportSchema.safeParse({
        descriptionsPresent: 10,
        totalNodes: 10,
        coverageRate: 101,
        nodesWithoutDescription: [],
      }).success,
    ).toBe(false)
  })
})
