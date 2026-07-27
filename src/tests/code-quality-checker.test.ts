/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkCodeQuality } from '../core/analyzer/code-quality-checker.js'
import { McpGraphError } from '../core/utils/errors.js'

vi.mock('node:child_process', () => ({
  execSync: vi.fn().mockReturnValue(Buffer.from('')),
}))

import { execSync } from 'node:child_process'

describe('checkCodeQuality', () => {
  beforeEach(() => {
    vi.mocked(execSync).mockClear()
    vi.mocked(execSync).mockReturnValue(Buffer.from(''))
  })

  it('throws McpGraphError for empty path', () => {
    expect(() => checkCodeQuality('')).toThrow(McpGraphError)
    expect(() => checkCodeQuality('')).toThrow('requires a valid project path')
  })

  it('returns report with passed:true when lint and typecheck pass', () => {
    const result = checkCodeQuality('.')
    expect(result.mode).toBe('code_quality')
    expect(result.score).toBe(100)
    expect(result.grade).toBe('A')
    expect(result.passed).toBe(true)
    expect(result.checks.length).toBe(2)
  })

  it('returns checks with expected names', () => {
    const result = checkCodeQuality('.')
    const names = result.checks.map((c) => c.name)
    expect(names).toContain('lint')
    expect(names).toContain('type_safety')
  })

  it('returns fail when lint reports errors', () => {
    vi.mocked(execSync).mockImplementation(() => {
      const err = new Error('lint error')
      ;(err as any).stdout = '2 errors 1 warning'
      throw err
    })
    const result = checkCodeQuality('.')
    const lintCheck = result.checks.find((c) => c.name === 'lint')
    expect(lintCheck?.passed).toBe(false)
    expect(result.passed).toBe(false)
    expect(result.score).toBeLessThan(100)
  })
})
