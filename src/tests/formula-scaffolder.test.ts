import { describe, it, expect } from 'vitest'
import { scaffoldFormula, InconsistentDomainError } from '../core/scaffolder/formula-scaffolder.js'
import type { FormulaSpec } from '../core/scaffolder/formula-scaffolder.js'

function makeSpec(overrides: Partial<FormulaSpec> = {}): FormulaSpec {
  return {
    id: 'spec-1',
    name: 'addNumbers',
    expression: 'a + b',
    domain: { a: 'R', b: 'R' },
    ...overrides,
  }
}

describe('scaffoldFormula', () => {
  it('returns a ScaffoldFormulaResult object', () => {
    const result = scaffoldFormula(makeSpec())
    expect(typeof result).toBe('object')
    expect(result.functionFile).toBeDefined()
    expect(result.testFile).toBeDefined()
  })

  it('functionFile has path and content', () => {
    const result = scaffoldFormula(makeSpec())
    expect(typeof result.functionFile.path).toBe('string')
    expect(typeof result.functionFile.content).toBe('string')
    expect(result.functionFile.content.length).toBeGreaterThan(0)
  })

  it('testFile has path and content', () => {
    const result = scaffoldFormula(makeSpec())
    expect(typeof result.testFile.path).toBe('string')
    expect(typeof result.testFile.content).toBe('string')
  })

  it('functionFile path contains the function name', () => {
    const result = scaffoldFormula(makeSpec({ name: 'myFormula' }))
    expect(result.functionFile.path).toContain('myFormula')
  })

  it('functionFile content contains the expression', () => {
    const result = scaffoldFormula(makeSpec({ expression: 'a * b' }))
    expect(result.functionFile.content).toContain('a * b')
  })

  it('functionFile content contains the function name', () => {
    const result = scaffoldFormula(makeSpec({ name: 'computeSum' }))
    expect(result.functionFile.content).toContain('computeSum')
  })

  it('testFile created flag is true for new test', () => {
    const result = scaffoldFormula(makeSpec())
    expect(result.testFile.created).toBe(true)
  })

  it('testFile created flag is false when existing content provided', () => {
    const result = scaffoldFormula(makeSpec(), { existingTestContent: '// existing test' })
    expect(result.testFile.created).toBe(false)
  })

  it('throws InconsistentDomainError when variable not in domain', () => {
    expect(() => scaffoldFormula(makeSpec({ expression: 'a + c', domain: { a: 'R' } }))).toThrow(
      InconsistentDomainError,
    )
  })

  it('preservedBlocks is an array', () => {
    const result = scaffoldFormula(makeSpec())
    expect(Array.isArray(result.functionFile.preservedBlocks)).toBe(true)
    expect(Array.isArray(result.testFile.preservedBlocks)).toBe(true)
  })

  it('uses custom functionDir when provided', () => {
    const result = scaffoldFormula(makeSpec(), { functionDir: 'custom/dir' })
    expect(result.functionFile.path).toContain('custom/dir')
  })
})
