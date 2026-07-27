/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { fuzzySearch, scoreFile } from '../schemas/fuzzy-search.schema.js'

describe('fuzzySearch', () => {
  const files = [
    'src/core/agent-driver/driver.ts',
    'src/core/agent-driver/turn.ts',
    'src/core/agent-driver/types.ts',
    'src/core/llm/gateway.ts',
    'src/core/hooks/hook-bus.ts',
    'src/core/hooks/hook-types.ts',
    'src/tests/agent-role.test.ts',
    'src/tests/agent-registry.test.ts',
    'src/tests/delegate-parallel.test.ts',
    'src/tests/guardian-reviewer.test.ts',
  ]

  it('should fuzzySearch(query, files) retorna ranked results', () => {
    const results = fuzzySearch('agent', files)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.file).toContain('agent')
    expect(results[0]?.score).toBeGreaterThan(0)
  })

  it('should rank exact substring match highest', () => {
    const r = fuzzySearch('hook-bus', files)
    expect(r[0]?.file).toBe('src/core/hooks/hook-bus.ts')
  })

  it('should rank prefix match higher than mid-word match', () => {
    const testFiles = ['src/agent.ts', 'src/delegate.ts', 'src/gate.ts']
    const r = fuzzySearch('gate', testFiles)
    expect(r[0]?.file).toBe('src/gate.ts')
    const delegateIdx = r.findIndex((x) => x.file.includes('delegate'))
    expect(delegateIdx).toBeGreaterThan(0)
  })

  it('should return empty for no match', () => {
    expect(fuzzySearch('zzzznotfound', files)).toEqual([])
  })
})

describe('scoreFile', () => {
  it('should give high score for consecutive chars', () => {
    const s = scoreFile('hook', 'src/core/hooks/hook-bus.ts')
    expect(s).toBeGreaterThan(0)
  })

  it('should penalize non-consecutive matches', () => {
    const consecutive = scoreFile('hook', 'src/core/hooks/hook-bus.ts')
    const nonConsecutive = scoreFile('hk', 'src/core/hooks/hook-bus.ts')
    expect(consecutive).toBeGreaterThan(nonConsecutive)
  })

  it('should prefer path segments (filename match)', () => {
    const filenameScore = scoreFile('driver', 'src/core/agent-driver/driver.ts')
    const pathScore = scoreFile('driver', 'src/core/llm/driver-helper.ts')
    expect(filenameScore).toBeGreaterThan(pathScore)
  })

  it('should handle smart case (lowercase query matches both)', () => {
    const s = scoreFile('driver', 'src/core/agent-driver/driver.ts')
    expect(s).toBeGreaterThan(0)
  })

  it('should return 0 for no match', () => {
    expect(scoreFile('xyz', 'src/core/hooks/hook-bus.ts')).toBe(0)
  })
})
