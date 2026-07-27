import { describe, it, expect } from 'vitest'
import { failureFocus } from '../core/tool-compress/filters/failureFocus.js'

describe('failureFocus', () => {
  it('returns string for empty input', () => {
    expect(typeof failureFocus('')).toBe('string')
  })

  it('passes through test summary lines', () => {
    const input = 'Test Files  1 passed (1)\nTests  5 passed (5)\nDuration  300ms'
    const result = failureFocus(input)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('preserves failure output', () => {
    const input = [
      '× src/tests/foo.test.ts > suite > case',
      'AssertionError: expected 1 to be 2',
      'Tests  1 failed (1)',
    ].join('\n')
    const result = failureFocus(input)
    expect(result).toContain('AssertionError')
  })

  it('handles all-pass output', () => {
    const input = '✓ src/tests/foo.test.ts (5 tests)\nTests  5 passed (5)'
    const result = failureFocus(input)
    expect(typeof result).toBe('string')
  })
})
