/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { failureFocus } from '../core/tool-compress/filters/failureFocus.js'

function vitestOutput(passCount: number, failCount: number): string {
  const lines: string[] = []
  for (let i = 1; i <= passCount; i++) {
    lines.push(` ✓ src/test_${i}.test.ts > should pass test ${i}`)
  }
  for (let i = 1; i <= failCount; i++) {
    lines.push(` ✗ src/test_${i}.test.ts > should fail test ${i}`)
    lines.push(`   AssertionError: expected 1 to be 2`)
    lines.push(`   at Object.<anonymous> (test_${i}.test.ts:10:20)`)
    lines.push('')
  }
  lines.push(` Test Files  ${failCount} failed | ${passCount} passed (${passCount + failCount})`)
  lines.push(`      Tests  ${failCount} failed | ${passCount} passed (${passCount + failCount})`)
  return lines.join('\n')
}

describe('failure-focus filter', () => {
  it('collapses all PASS lines into a count', () => {
    const text = vitestOutput(100, 0)
    const result = failureFocus(text)
    expect(result).toContain('100 tests passed (collapsed)')
    expect(result.split('\n').length).toBeLessThan(10)
  })

  it('preserves FAIL lines with stack traces', () => {
    const text = vitestOutput(5, 3)
    const result = failureFocus(text)
    expect(result).toContain('AssertionError')
    expect(result).toContain('3 tests failed')
  })

  it('achieves >=94% reduction on pass-only suite', () => {
    const text = vitestOutput(200, 0)
    const result = failureFocus(text)
    const reduction = ((text.length - result.length) / text.length) * 100
    expect(reduction).toBeGreaterThanOrEqual(94)
  })

  it('preserves summary lines', () => {
    const text = vitestOutput(10, 2)
    const result = failureFocus(text)
    expect(result).toContain('Test Files')
    expect(result).toContain('Tests')
  })

  it('returns original text if compression would be worse', () => {
    const result = failureFocus('short')
    expect(result).toBe('short')
  })

  it('handles mixed pass/fail with >90% pass rate', () => {
    const text = vitestOutput(95, 5)
    const result = failureFocus(text)
    expect(result).toContain('95 tests passed (collapsed)')
    expect(result).toContain('5 tests failed')
  })
})
