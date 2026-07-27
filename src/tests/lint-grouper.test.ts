import { describe, it, expect } from 'vitest'
import { lintGrouper } from '../core/tool-compress/filters/lintGrouper.js'

describe('lintGrouper', () => {
  it('returns original text when no lint errors are found', () => {
    const text = 'some output without errors'
    expect(lintGrouper(text)).toBe(text)
  })

  it('groups TSC errors by rule', () => {
    const tscErrors = [
      'src/foo.ts(10,5): error TS2345: Argument of type string is not assignable.',
      'src/bar.ts(20,1): error TS2345: Argument of type number is not assignable.',
      'src/baz.ts(5,3): error TS2551: Property does not exist.',
    ].join('\n')
    const result = lintGrouper(tscErrors)
    expect(result).toContain('TS2345')
    expect(result).toContain('× 2')
    expect(result).toContain('TS2551')
  })

  it('reports total error count for many errors (grouped output shorter than original)', () => {
    const tscErrors = Array.from(
      { length: 15 },
      (_, i) =>
        `src/f${i}.ts(${i + 1},1): error TS2345: Argument of type string is not assignable to parameter of type number.`,
    ).join('\n')
    const result = lintGrouper(tscErrors)
    // grouped output must contain the rule and count
    expect(result).toContain('TS2345')
    expect(result).toContain('× 15')
  })

  it('groups ESLint errors by rule', () => {
    const eslint = [
      '  10:5  error  Unexpected console statement  no-console',
      '  20:1  error  Unexpected console statement  no-console',
      '  30:3  warning  Missing semicolon  semi',
    ].join('\n')
    const result = lintGrouper(eslint)
    expect(result).toContain('no-console')
    expect(result).toContain('× 2')
  })

  it('groups Ruff/Pylint errors by rule', () => {
    const ruff = [
      'src/main.py:10:5: E302 Expected 2 blank lines, got 1',
      'src/utils.py:5:1: E302 Expected 2 blank lines, got 0',
    ].join('\n')
    const result = lintGrouper(ruff)
    expect(result).toContain('E302')
  })

  it('has filterName property', () => {
    const fn = lintGrouper as unknown as { filterName: string }
    expect(fn.filterName).toBe('lint-grouper')
  })

  it('returns string output for empty string', () => {
    const result = lintGrouper('')
    expect(typeof result).toBe('string')
  })

  it('returns shorter output than original for many duplicate errors', () => {
    const many = Array.from({ length: 20 }, (_, i) => `src/f${i}.ts(1,1): error TS2345: msg`)
    const text = many.join('\n')
    const result = lintGrouper(text)
    expect(result.length).toBeLessThan(text.length)
  })
})
