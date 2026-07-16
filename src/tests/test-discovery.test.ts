/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { discoverTestFiles } from '../core/harness/test-discovery.js'

vi.mock('node:fs', () => ({
  existsSync: vi.fn((p: string) => {
    if (p.includes('no-tests-dir')) return false
    if (p.includes('src/tests')) return true
    return false
  }),
  readdirSync: vi.fn((_p: string) => {
    return ['harnessability-score.test.ts', 'harness-cache.test.ts', 'some-random.test.ts', 'non-matching.ts']
  }),
}))

describe('discoverTestFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when tests directory does not exist', () => {
    const result = discoverTestFiles('harness cache', '/tmp/no-tests-dir')
    expect(result).toEqual([])
  })

  it('discovers test files matching title keywords', () => {
    const result = discoverTestFiles('Harnessability Score', '/tmp/my-project')
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toContain('harnessability-score.test.ts')
  })

  it('returns empty array when no keywords match', () => {
    const result = discoverTestFiles('zxywvut completely unrelated', '/tmp/my-project')
    expect(result).toEqual([])
  })

  it('returns empty array for title with only stopwords', () => {
    const result = discoverTestFiles('a an the to for', '/tmp/my-project')
    expect(result).toEqual([])
  })

  it('returns file paths relative to src/tests/', () => {
    const result = discoverTestFiles('Score Test', '/tmp/my-project')
    for (const file of result) {
      expect(file.startsWith('src/tests/')).toBe(true)
      expect(file.endsWith('.test.ts')).toBe(true)
    }
  })
})
