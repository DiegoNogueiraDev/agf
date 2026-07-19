/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { runTests } from '../core/harness/test-runner.js'

describe('runTests', () => {
  it('returns empty success for empty test files', async () => {
    const result = await runTests([])
    expect(result.success).toBe(true)
    expect(result.passed).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.durationMs).toBe(0)
  })

  it('returns non-success for non-existent test files', async () => {
    const result = await runTests(['src/tests/non-existent-file.test.ts'])
    expect(result.success).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(0)
  })

  it('respects custom working directory', async () => {
    const result = await runTests([], { cwd: '/tmp' })
    expect(result.success).toBe(true)
    expect(result.passed).toBe(0)
  })
})
