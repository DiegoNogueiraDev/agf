/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkTestCoverage } from '../core/analyzer/test-coverage-checker.js'

vi.mock('node:child_process', () => ({
  execSync: vi.fn().mockReturnValue(''),
}))

import { execSync } from 'node:child_process'

describe('checkTestCoverage', () => {
  beforeEach(() => {
    vi.mocked(execSync).mockClear()
  })

  it('returns a report with expected shape with all passing', () => {
    vi.mocked(execSync).mockReturnValue('Tests: 150 passed, 150 total')
    const result = checkTestCoverage('.')
    expect(result.mode).toBe('test_coverage')
    expect(typeof result.score).toBe('number')
    expect(typeof result.grade).toBe('string')
    expect(Array.isArray(result.checks)).toBe(true)
    expect(typeof result.testCount).toBe('number')
    expect(typeof result.coveragePercent).toBe('number')
  })

  it('includes test_suite check and test_count check', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('Tests: 150 passed, 150 total'))
    const result = checkTestCoverage('.')
    const names = result.checks.map((c) => c.name)
    expect(names).toContain('test_suite')
    expect(names).toContain('test_count')
  })

  it('test_suite passes when all tests pass', () => {
    vi.mocked(execSync).mockReturnValue('Tests: 120 passed, 120 total')
    const result = checkTestCoverage('.')
    const suiteCheck = result.checks.find((c) => c.name === 'test_suite')
    expect(suiteCheck?.passed).toBe(true)
  })

  it('test_suite fails when tests fail', () => {
    vi.mocked(execSync).mockImplementation(() => {
      const err = new Error('test failure')
      ;(err as any).stdout = 'Tests: 5 failed, 120 passed, 125 total'
      throw err
    })
    const result = checkTestCoverage('.')
    const suiteCheck = result.checks.find((c) => c.name === 'test_suite')
    expect(suiteCheck?.passed).toBe(false)
    expect(result.findings.length).toBeGreaterThanOrEqual(1)
  })

  it('test_count is healthy when >= 100', () => {
    vi.mocked(execSync).mockReturnValue('Tests: 100 passed, 100 total')
    const result = checkTestCoverage('.')
    const countCheck = result.checks.find((c) => c.name === 'test_count')
    expect(countCheck?.passed).toBe(true)
  })

  it('test_count is unhealthy when < 100', () => {
    vi.mocked(execSync).mockReturnValue('Tests: 50 passed, 50 total')
    const result = checkTestCoverage('.')
    const countCheck = result.checks.find((c) => c.name === 'test_count')
    expect(countCheck?.passed).toBe(false)
  })

  it('handles non-existent path gracefully (exec falls back to error)', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('ENOENT')
    })
    const result = checkTestCoverage('/tmp/nonexistent')
    expect(typeof result.score).toBe('number')
    expect(Array.isArray(result.checks)).toBe(true)
  })
})
