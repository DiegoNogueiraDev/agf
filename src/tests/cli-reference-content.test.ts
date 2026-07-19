import { describe, it, expect } from 'vitest'
import { buildCommandTable, AGF_MANDATORY_RULE, AGF_WORKFLOW } from '../core/config/cli-reference-content.js'

describe('buildCommandTable', () => {
  it('returns a string', () => {
    const result = buildCommandTable()
    expect(typeof result).toBe('string')
  })

  it('returns non-empty content', () => {
    expect(buildCommandTable().length).toBeGreaterThan(0)
  })

  it('contains agf command references', () => {
    const result = buildCommandTable()
    expect(result).toContain('agf')
  })

  it('is deterministic across calls', () => {
    expect(buildCommandTable()).toBe(buildCommandTable())
  })
})

describe('AGF_MANDATORY_RULE', () => {
  it('is a non-empty string', () => {
    expect(typeof AGF_MANDATORY_RULE).toBe('string')
    expect(AGF_MANDATORY_RULE.length).toBeGreaterThan(0)
  })

  it('mentions agf', () => {
    expect(AGF_MANDATORY_RULE.toLowerCase()).toContain('agf')
  })
})

describe('AGF_WORKFLOW', () => {
  it('is a non-empty string', () => {
    expect(typeof AGF_WORKFLOW).toBe('string')
    expect(AGF_WORKFLOW.length).toBeGreaterThan(0)
  })

  it('mentions agf start or agf done', () => {
    expect(AGF_WORKFLOW).toMatch(/agf (start|done)/i)
  })
})
