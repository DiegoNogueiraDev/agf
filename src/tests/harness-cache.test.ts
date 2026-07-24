/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resetHarnessCache } from '../core/harness/harness-cache.js'
import * as harnessCacheModule from '../core/harness/harness-cache.js'

vi.mock('../core/harness/harness-scan-runner.js', () => ({
  runHarnessScan: vi.fn(() => ({
    score: 85,
    grade: 'A',
    details: ['Type Coverage: 100%'],
    timestamp: new Date().toISOString(),
    ruleSuggestions: [],
    breakdown: {
      types: { score: 100, weight: 0.25 },
      tests: { score: 100, weight: 0.25 },
      fitness: { score: 100, weight: 0.15 },
      docs: { score: 100, weight: 0.1 },
      naming: { score: 100, weight: 0.1 },
      errors: { score: 100, weight: 0.05 },
      context: { score: 100, weight: 0.05 },
      provenance: { score: 100, weight: 0.05 },
    },
  })),
}))

vi.mock('../core/utils/errors.js', () => ({
  McpGraphError: class McpGraphError extends Error {
    constructor(m: string) {
      super(m)
      this.name = 'McpGraphError'
    }
  },
}))

vi.mock('../core/utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  }),
}))

vi.mock('child_process', () => ({
  execSync: vi.fn(() => 'abc123def\n'),
}))

describe('runHarnessScanCached', () => {
  beforeEach(() => {
    resetHarnessCache()
    vi.clearAllMocks()
  })

  afterEach(() => {
    resetHarnessCache()
  })

  it('throws McpGraphError when rootDir is empty', () => {
    expect(() => harnessCacheModule.runHarnessScanCached('')).toThrow('Harness scan requires a valid rootDir')
  })

  it('returns scan result on cache miss', () => {
    const result = harnessCacheModule.runHarnessScanCached('/tmp/test-project')
    expect(result).not.toBeNull()
    expect(result!.score).toBe(85)
    expect(result!.grade).toBe('A')
  })

  it('returns cached result on subsequent call', () => {
    const first = harnessCacheModule.runHarnessScanCached('/tmp/test-project')
    const second = harnessCacheModule.runHarnessScanCached('/tmp/test-project')
    expect(second!.score).toBe(first!.score)
  })
})
