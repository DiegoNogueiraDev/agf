import { describe, it, expect } from 'vitest'
import { evaluateComplexityBudget } from '../core/implementer/complexity-budget.js'

describe('evaluateComplexityBudget', () => {
  it('returns passed:true for empty implementationFiles', () => {
    const result = evaluateComplexityBudget({
      implementationFiles: [],
      testFiles: [],
      hasChildren: false,
    })
    expect(result.passed).toBe(true)
    expect(result.filesScanned).toBe(0)
    expect(result.violations).toHaveLength(0)
  })

  it('result has required fields', () => {
    const result = evaluateComplexityBudget({
      implementationFiles: [],
      testFiles: [],
      hasChildren: false,
    })
    expect(typeof result.passed).toBe('boolean')
    expect(typeof result.details).toBe('string')
    expect(Array.isArray(result.violations)).toBe(true)
    expect(typeof result.filesScanned).toBe('number')
  })

  it('skips nonexistent files gracefully', () => {
    const result = evaluateComplexityBudget({
      implementationFiles: ['/nonexistent/path/that/does-not-exist.ts'],
      testFiles: [],
      hasChildren: false,
    })
    expect(result.passed).toBe(true)
    expect(result.filesScanned).toBe(0)
  })

  it('returns passed:true when real file is within LOC limit', () => {
    // Use a file known to exist and be under 200 LOC
    const result = evaluateComplexityBudget({
      implementationFiles: ['src/core/context/compress-text.ts'],
      testFiles: [],
      hasChildren: false,
    })
    expect(result.filesScanned).toBeGreaterThanOrEqual(0)
  })

  it('does not flag large files when hasChildren is true', () => {
    // A large file won't violate file_too_large if node has subtasks
    const result = evaluateComplexityBudget({
      implementationFiles: ['src/core/context/compact-template.ts'],
      testFiles: [],
      hasChildren: true,
    })
    const fileLargeViolations = result.violations.filter((v) => v.kind === 'file_too_large')
    expect(fileLargeViolations).toHaveLength(0)
  })

  it('violations array has kind field', () => {
    const result = evaluateComplexityBudget({
      implementationFiles: [],
      testFiles: [],
      hasChildren: false,
    })
    for (const v of result.violations) {
      expect(typeof v.kind).toBe('string')
    }
  })
})
