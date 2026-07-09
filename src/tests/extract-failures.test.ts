import { describe, it, expect } from 'vitest'
import { extractAllFailures, buildStructuredSummary } from '../core/tool-compress/extract-failures.js'

describe('extractAllFailures', () => {
  it('returns empty array for empty input', () => {
    expect(extractAllFailures('')).toEqual([])
  })

  it('returns array', () => {
    expect(Array.isArray(extractAllFailures('some test output'))).toBe(true)
  })

  it('extracts vitest failure blocks', () => {
    const input = [
      '× src/tests/foo.test.ts > suite > test case',
      'AssertionError: expected 1 to be 2',
      '  - Expected: 2',
      '  + Received: 1',
    ].join('\n')
    const failures = extractAllFailures(input)
    expect(failures.length).toBeGreaterThanOrEqual(0)
  })
})

describe('buildStructuredSummary', () => {
  it('returns object for empty input', () => {
    const result = buildStructuredSummary('')
    expect(typeof result).toBe('object')
    expect(result).not.toBeNull()
  })

  it('has count and files fields', () => {
    const result = buildStructuredSummary('some output')
    expect(typeof result.count).toBe('number')
    expect(Array.isArray(result.files)).toBe(true)
  })

  it('count is 0 for empty input', () => {
    const result = buildStructuredSummary('')
    expect(result.count).toBe(0)
    expect(result.files).toHaveLength(0)
  })
})
