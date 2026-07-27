/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_3e291fe4df16 — Tests for lintGrouper pure filter function
 * AC: GIVEN TSC errors WHEN lintGrouper processes THEN groups by TS code with counts
 * AC: GIVEN unknown format WHEN lintGrouper processes THEN returns original text unchanged
 * AC: GIVEN ESLint errors WHEN lintGrouper processes THEN groups by rule name
 */
import { describe, it, expect } from 'vitest'
import { lintGrouper } from '../core/tool-compress/filters/lintGrouper.js'

const TSC_SAMPLE = `src/core/foo.ts(10,5): error TS2304: Cannot find name 'bar'.
src/core/baz.ts(22,3): error TS2304: Cannot find name 'bar'.
src/core/qux.ts(1,1): warning TS6133: 'unused' is declared but its value is never read.`

const ESLINT_SAMPLE = `  10:5  error  Missing semicolon  semi
  20:3  error  Unexpected var     no-var
  30:1  warning  Long line        max-len`

// Needs enough lines that the grouped output is smaller than the original
const RUFF_SAMPLE =
  Array.from(
    { length: 15 },
    (_, i) => `src/module_${i}.py:${i + 1}:5: E501 Line too long (${100 + i} > 88 characters)`,
  ).join('\n') + "\nsrc/baz.py:3:3: F401 'os' imported but unused"

describe('lintGrouper', () => {
  it('returns original text when no lint patterns match', () => {
    const text = 'this is plain text with no lint errors\nand another line'
    expect(lintGrouper(text)).toBe(text)
  })

  it('returns original text when input is empty', () => {
    expect(lintGrouper('')).toBe('')
  })

  it('groups TSC errors by error code', () => {
    const result = lintGrouper(TSC_SAMPLE)
    expect(result).toContain('TS2304')
    expect(result).toContain('× 2')
    expect(result).toContain('TS6133')
  })

  it('reports error and warning totals for TSC input', () => {
    const result = lintGrouper(TSC_SAMPLE)
    expect(result).toMatch(/2 errors/)
    expect(result).toMatch(/1 warnings/)
  })

  it('groups ESLint errors by rule name', () => {
    const result = lintGrouper(ESLINT_SAMPLE)
    expect(result).toContain('semi')
    expect(result).toContain('no-var')
  })

  it('groups Ruff/Pylint errors by code', () => {
    const result = lintGrouper(RUFF_SAMPLE)
    expect(result).toContain('E501')
    expect(result).toContain('× 15')
    expect(result).toContain('F401')
  })

  it('does not return result longer than input', () => {
    const result = lintGrouper(TSC_SAMPLE)
    expect(result.length).toBeLessThanOrEqual(TSC_SAMPLE.length)
  })

  it('filterName property is set to lint-grouper', () => {
    const fn = lintGrouper as unknown as { filterName: string }
    expect(fn.filterName).toBe('lint-grouper')
  })
})
