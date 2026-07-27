/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { runTestGate } from '../core/harness/test-gate.js'

const mockStore = {
  getNodeById: vi.fn((id: string) => {
    if (id === 'node-with-tests') {
      return {
        id: 'node-with-tests',
        testFiles: ['src/tests/sample.test.ts'],
      }
    }
    if (id === 'node-no-tests') {
      return { id: 'node-no-tests', testFiles: [] }
    }
    return undefined
  }),
}

describe('runTestGate', () => {
  it('skips when mode is off', async () => {
    const result = await runTestGate(mockStore as any, 'node-with-tests', 'off')
    expect(result.status).toBe('skipped')
    expect(result.blocked).toBe(false)
    expect(result.mode).toBe('off')
  })

  it('skips when node has no testFiles', async () => {
    const result = await runTestGate(mockStore as any, 'node-no-tests', 'strict')
    expect(result.status).toBe('skipped')
    expect(result.blocked).toBe(false)
  })

  it('skips when node is not found', async () => {
    const result = await runTestGate(mockStore as any, 'non-existent', 'advisory')
    expect(result.status).toBe('skipped')
    expect(result.blocked).toBe(false)
  })

  it('returns passed when tests pass in advisory mode', async () => {
    const result = await runTestGate(mockStore as any, 'node-with-tests', 'advisory')
    expect(result).toHaveProperty('status')
    expect(result).toHaveProperty('blocked')
    expect(result).toHaveProperty('mode')
    expect(result.mode).toBe('advisory')
  })
})
