/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_c772ca14b517 — wire-check gate: signal mock-only branches never
 * called by real callers. Most expensive real pattern (ServiceNow, SFTP): a
 * client/service existed with tests, but no provider ever injected a real
 * adapter outside mock mode — USE_MOCK=false would break in production with
 * no test catching it. findUnwiredMockBranches is a pure, injectable-file-set
 * detector (mirrors detect-phantom-done.ts's DIP shape): it finds a
 * mock-gated conditional in one file, then checks whether any OTHER,
 * non-test file in the provided set actually activates it.
 */

import { describe, it, expect } from 'vitest'
import { findUnwiredMockBranches } from '../core/harness/wire-check.js'

describe('findUnwiredMockBranches', () => {
  it('signals UNWIRED_BRANCH when only test files activate a mock-gated branch', () => {
    const target = {
      path: 'src/core/adapter.ts',
      content: 'export function run(useMock: boolean) {\n  if (useMock === false) {\n    callRealAdapter()\n  }\n}\n',
    }
    const files = [target, { path: 'src/tests/adapter.test.ts', content: 'run(false) // only a test activates it\n' }]
    const result = findUnwiredMockBranches(target, files)
    expect(result).toHaveLength(1)
    expect(result[0].param).toBe('useMock')
  })

  it('does NOT signal when a non-test caller activates the branch', () => {
    const target = {
      path: 'src/core/adapter.ts',
      content: 'export function run(useMock: boolean) {\n  if (useMock === false) {\n    callRealAdapter()\n  }\n}\n',
    }
    const files = [
      target,
      { path: 'src/cli/commands/run-cmd.ts', content: 'run(useMock: false)\n' },
      { path: 'src/tests/adapter.test.ts', content: 'run(false)\n' },
    ]
    const result = findUnwiredMockBranches(target, files)
    expect(result).toHaveLength(0)
  })

  it('does NOT signal when the file has no mock-gated conditional (not applicable)', () => {
    const target = {
      path: 'src/core/plain.ts',
      content: 'export function add(a: number, b: number) {\n  return a + b\n}\n',
    }
    const result = findUnwiredMockBranches(target, [target])
    expect(result).toEqual([])
  })

  it('recognizes the !mock negation shape too', () => {
    const target = {
      path: 'src/core/adapter2.ts',
      content: 'export function run(mock: boolean) {\n  if (!mock) {\n    callRealAdapter()\n  }\n}\n',
    }
    const files = [target, { path: 'src/tests/adapter2.test.ts', content: 'run(false)\n' }]
    const result = findUnwiredMockBranches(target, files)
    expect(result).toHaveLength(1)
    expect(result[0].param).toBe('mock')
  })
})
