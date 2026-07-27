import { describe, it, expect } from 'vitest'
import { composeCacheKey, composeCacheKey64, type GraphFingerprint } from '../tui/slash/cache-key-composer.js'

const fp: GraphFingerprint = { totalNodes: 10, byStatus: { done: 5, backlog: 3, in_progress: 2 }, lastMutationTs: 1000 }

describe('composeCacheKey', () => {
  it('returns deterministic results for same inputs', () => {
    const a = composeCacheKey('stats', '', fp, 1)
    const b = composeCacheKey('stats', '', fp, 1)
    expect(a).toBe(b)
  })

  it('returns different hash for different commands', () => {
    const a = composeCacheKey('stats', '', fp, 1)
    const b = composeCacheKey('metrics', '', fp, 1)
    expect(a).not.toBe(b)
  })

  it('returns different hash for different schema versions', () => {
    const a = composeCacheKey('stats', '', fp, 1)
    const b = composeCacheKey('stats', '', fp, 2)
    expect(a).not.toBe(b)
  })

  it('returns different hash for different args', () => {
    const a = composeCacheKey('getSkill', 'foo', fp, 1)
    const b = composeCacheKey('getSkill', 'bar', fp, 1)
    expect(a).not.toBe(b)
  })

  it('handles empty fingerprint byStatus', () => {
    const empty: GraphFingerprint = { totalNodes: 0, byStatus: {}, lastMutationTs: 0 }
    const result = composeCacheKey('stats', '', empty, 1)
    expect(result).toBeTypeOf('string')
    expect(result.length).toBe(8)
  })
})

describe('composeCacheKey64', () => {
  it('returns deterministic 64-bit results', () => {
    const a = composeCacheKey64('stats', '', fp, 1)
    const b = composeCacheKey64('stats', '', fp, 1)
    expect(a).toBe(b)
    expect(a.length).toBe(16)
  })

  it('returns different hash from 32-bit variant', () => {
    const a = composeCacheKey('stats', '', fp, 1)
    const b = composeCacheKey64('stats', '', fp, 1)
    expect(a).not.toBe(b)
  })
})
