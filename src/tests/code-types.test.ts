import { describe, it, expect } from 'vitest'
import {
  SymbolKindSchema,
  RelationTypeSchema,
  RiskLevelSchema,
  CodeSymbolSchema,
  calculateRiskLevel,
} from '../core/code/code-types.js'

describe('SymbolKindSchema', () => {
  it('accepts valid symbol kinds', () => {
    expect(() => SymbolKindSchema.parse('function')).not.toThrow()
    expect(() => SymbolKindSchema.parse('class')).not.toThrow()
    expect(() => SymbolKindSchema.parse('interface')).not.toThrow()
    expect(() => SymbolKindSchema.parse('method')).not.toThrow()
  })

  it('rejects unknown symbol kind', () => {
    expect(() => SymbolKindSchema.parse('constructor')).toThrow()
    expect(() => SymbolKindSchema.parse('')).toThrow()
  })
})

describe('RelationTypeSchema', () => {
  it('accepts valid relation types', () => {
    expect(() => RelationTypeSchema.parse('calls')).not.toThrow()
    expect(() => RelationTypeSchema.parse('imports')).not.toThrow()
    expect(() => RelationTypeSchema.parse('extends')).not.toThrow()
  })

  it('rejects unknown relation type', () => {
    expect(() => RelationTypeSchema.parse('depends_on')).toThrow()
  })
})

describe('RiskLevelSchema', () => {
  it('accepts low, medium, high', () => {
    expect(() => RiskLevelSchema.parse('low')).not.toThrow()
    expect(() => RiskLevelSchema.parse('medium')).not.toThrow()
    expect(() => RiskLevelSchema.parse('high')).not.toThrow()
  })

  it('rejects unknown risk level', () => {
    expect(() => RiskLevelSchema.parse('critical')).toThrow()
  })
})

describe('CodeSymbolSchema', () => {
  it('parses a valid code symbol', () => {
    const sym = CodeSymbolSchema.parse({
      id: 's1',
      projectId: 'p1',
      name: 'myFn',
      kind: 'function',
      file: 'src/foo.ts',
      startLine: 1,
      endLine: 10,
      exported: true,
      indexedAt: '2026-06-23T00:00:00Z',
    })
    expect(sym.name).toBe('myFn')
    expect(sym.kind).toBe('function')
  })

  it('requires startLine >= 1', () => {
    expect(() =>
      CodeSymbolSchema.parse({
        id: 's1',
        projectId: 'p1',
        name: 'f',
        kind: 'function',
        file: 'f.ts',
        startLine: 0,
        endLine: 1,
        exported: false,
        indexedAt: '2026-01-01',
      }),
    ).toThrow()
  })
})

describe('calculateRiskLevel', () => {
  it('returns low for count < 5', () => {
    expect(calculateRiskLevel(0)).toBe('low')
    expect(calculateRiskLevel(4)).toBe('low')
  })

  it('returns medium for count 5–15', () => {
    expect(calculateRiskLevel(5)).toBe('medium')
    expect(calculateRiskLevel(15)).toBe('medium')
  })

  it('returns high for count > 15', () => {
    expect(calculateRiskLevel(16)).toBe('high')
    expect(calculateRiskLevel(100)).toBe('high')
  })
})
