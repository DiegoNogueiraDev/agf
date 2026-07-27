import { describe, it, expect } from 'vitest'
import { testRunner } from '../core/tool-compress/filters/testRunner.js'
import { gitStatus } from '../core/tool-compress/filters/gitStatus.js'
import { lintReport } from '../core/tool-compress/filters/lintReport.js'

describe('testRunner', () => {
  it('returns input unchanged for empty string', () => {
    expect(testRunner('')).toBe('')
  })

  it('returns a string', () => {
    const input = 'Test Files  1 passed (1)\nTests  5 passed (5)\nDuration  300ms'
    expect(typeof testRunner(input)).toBe('string')
  })

  it('preserves FAIL lines', () => {
    const input = 'FAIL src/tests/foo.test.ts\nAssertionError: expected 1 to be 2\nTests 1 failed (1)'
    const result = testRunner(input)
    expect(result).toContain('AssertionError')
  })

  it('includes summary lines', () => {
    const input = 'some noise\nTest Files  1 passed\nTests  5 passed'
    const result = testRunner(input)
    expect(result).toContain('passed')
  })
})

describe('gitStatus', () => {
  it('returns string for empty input', () => {
    expect(typeof gitStatus('')).toBe('string')
  })

  it('returns clean message for nothing-to-commit status', () => {
    const result = gitStatus('nothing to commit, working tree clean')
    expect(result).toContain('clean')
  })

  it('summarizes staged and modified counts', () => {
    const input = ['## main...origin/main', 'M  src/core/foo.ts', 'A  src/tests/bar.test.ts', '?? newfile.ts'].join(
      '\n',
    )
    const result = gitStatus(input)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('shows branch name from ## header', () => {
    const input = '## main...origin/main\nM  src/core/foo.ts'
    const result = gitStatus(input)
    expect(result).toContain('main')
  })
})

describe('lintReport', () => {
  it('returns string for empty input', () => {
    expect(typeof lintReport('')).toBe('string')
  })

  it('returns string for valid lint output', () => {
    const input = [
      'src/core/foo.ts',
      '  10:5  error  no-console  Unexpected console statement  no-console',
      '  15:3  warning  @typescript-eslint/no-explicit-any  Unexpected any',
    ].join('\n')
    const result = lintReport(input)
    expect(typeof result).toBe('string')
  })

  it('passes through non-matching content', () => {
    const input = 'nothing to lint here'
    const result = lintReport(input)
    expect(typeof result).toBe('string')
  })
})
