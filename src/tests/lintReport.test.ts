import { describe, it, expect } from 'vitest'
import { lintReport } from '../core/tool-compress/filters/lintReport.js'

describe('lintReport — passthrough', () => {
  it('returns input when no parseable lines', () => {
    const input = 'nothing relevant here'
    expect(lintReport(input)).toBe(input)
  })

  it('returns input for empty string', () => {
    expect(lintReport('')).toBe('')
  })
})

describe('lintReport — TypeScript (tsc) aggregation', () => {
  it('aggregates tsc errors by code', () => {
    const input = [
      "src/foo.ts(12,5): error TS6133: 'x' is declared but never used.",
      "src/bar.ts(3,1): error TS6133: 'y' is declared but never used.",
    ].join('\n')
    const result = lintReport(input)
    expect(result).toContain('TS6133 × 2')
  })

  it('includes the message in the aggregated line', () => {
    const input = "src/foo.ts(12,5): error TS6133: 'x' is declared but never used."
    const result = lintReport(input)
    expect(result).toContain("'x' is declared but never used.")
  })

  it('shows location under the rule line (with enough lines to trigger compression)', () => {
    const lines = Array.from(
      { length: 10 },
      (_, i) => `src/file${i}.ts(${i + 1},1): error TS2304: Cannot find name 'Foo'.`,
    )
    const result = lintReport(lines.join('\n'))
    expect(result).toContain('src/file0.ts:1:1')
  })

  it('keeps tsc summary line', () => {
    const input = ['src/foo.ts(1,1): error TS2345: bad type.', 'Found 1 error.'].join('\n')
    const result = lintReport(input)
    expect(result).toContain('Found 1 error.')
  })
})

describe('lintReport — ESLint aggregation', () => {
  it('aggregates eslint warnings by rule', () => {
    const input = [
      '/project/src/a.ts',
      "  10:5  warning  'z' is assigned a value but never used  no-unused-vars",
      "  20:1  warning  'w' is assigned a value but never used  no-unused-vars",
    ].join('\n')
    const result = lintReport(input)
    expect(result).toContain('no-unused-vars × 2')
  })

  it('keeps eslint summary line', () => {
    const input = [
      '/project/src/a.ts',
      '  1:1  error  Parsing error  no-parse',
      '✖ 1 problem (1 error, 0 warnings)',
    ].join('\n')
    const result = lintReport(input)
    expect(result).toContain('1 problem')
  })
})

describe('lintReport — Python/ruff aggregation', () => {
  it('aggregates ruff errors by code', () => {
    const input = [
      'src/main.py:5:1: E501 Line too long (120 > 88 characters)',
      'src/utils.py:10:3: E501 Line too long (95 > 88 characters)',
    ].join('\n')
    const result = lintReport(input)
    expect(result).toContain('E501 × 2')
  })
})

describe('lintReport — filterName', () => {
  it('has filterName "lint-report"', () => {
    expect(lintReport.filterName).toBe('lint-report')
  })
})
