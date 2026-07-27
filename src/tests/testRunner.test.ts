import { describe, it, expect } from 'vitest'
import { testRunner } from '../core/tool-compress/filters/testRunner.js'

describe('testRunner — passthrough', () => {
  it('returns original input when empty', () => {
    expect(testRunner('')).toBe('')
  })

  it('collapses many passing lines shorter than the count prefix', () => {
    const lines = Array.from({ length: 20 }, (_, i) => ` ✓ test ${i} passes`).join('\n')
    const result = testRunner(lines)
    expect(result).toContain('passando')
    expect(result.length).toBeLessThan(lines.length)
  })
})

describe('testRunner — vitest pass collapse', () => {
  it('collapses multiple passing tests into a count line', () => {
    const lines = [' ✓ test one passes', ' ✓ test two passes', ' ✓ test three passes'].join('\n')
    const result = testRunner(lines)
    expect(result).toContain('3 passando')
    expect(result).not.toContain('test one passes')
  })
})

describe('testRunner — vitest failure preservation', () => {
  it('preserves failing test line', () => {
    const input = ' × my test failed'
    const result = testRunner(input)
    expect(result).toContain('my test failed')
  })

  it('preserves failure detail with AssertionError', () => {
    const lines = [' × my test failed', 'AssertionError: expected 1 to equal 2'].join('\n')
    const result = testRunner(lines)
    expect(result).toContain('AssertionError')
  })

  it('preserves "expected" / "received" context lines', () => {
    const lines = [' × my test failed', ' → Expected: 1', ' → Received: 2'].join('\n')
    const result = testRunner(lines)
    expect(result).toContain('Expected')
    expect(result).toContain('Received')
  })
})

describe('testRunner — summary preservation', () => {
  it('preserves Test Files summary line', () => {
    const lines = [' ✓ a test', ' ✓ b test', 'Test Files  1 passed (1)'].join('\n')
    const result = testRunner(lines)
    expect(result).toContain('Test Files')
  })

  it('preserves Tests summary line', () => {
    const lines = [' ✓ a test', 'Tests  2 passed (2)'].join('\n')
    const result = testRunner(lines)
    expect(result).toContain('Tests')
  })

  it('preserves Duration line', () => {
    const input = 'Duration  1.2s'
    expect(testRunner(input)).toContain('Duration')
  })
})

describe('testRunner — jest support', () => {
  it('collapses many jest PASS lines shorter than input', () => {
    const lines = Array.from({ length: 20 }, (_, i) => ` PASS src/tests/file-${i}.test.ts`).join('\n')
    const result = testRunner(lines)
    expect(result).toContain('passando')
    expect(result.length).toBeLessThan(lines.length)
  })

  it('preserves jest FAIL line', () => {
    const input = ' FAIL src/bar.test.ts'
    expect(testRunner(input)).toContain('FAIL src/bar.test.ts')
  })
})

describe('testRunner — filterName property', () => {
  it('has filterName "test-runner"', () => {
    expect(testRunner.filterName).toBe('test-runner')
  })
})
