import { describe, it, expect } from 'vitest'
import { TaskPrefetcher } from '../core/planner/task-prefetcher.js'

function makePrefetcher(ttlMs = 60_000) {
  return new TaskPrefetcher({ ttlMs })
}

describe('TaskPrefetcher', () => {
  it('returns null for a cache miss', () => {
    const p = makePrefetcher()
    expect(p.get('node_missing')).toBeNull()
  })

  it('returns stored context on hit', () => {
    const p = makePrefetcher()
    p.prefetch('node_1', { query: 'fetch context', context: 'some context data' })
    const result = p.get('node_1')
    expect(result?.context).toBe('some context data')
    expect(result?.query).toBe('fetch context')
  })

  it('returns null after clear()', () => {
    const p = makePrefetcher()
    p.prefetch('node_2', { query: 'q', context: 'c' })
    p.clear()
    expect(p.get('node_2')).toBeNull()
  })

  it('returns null after TTL expires', async () => {
    const p = makePrefetcher(1) // 1ms TTL
    p.prefetch('node_3', { query: 'q', context: 'c' })
    await new Promise((r) => setTimeout(r, 10))
    expect(p.get('node_3')).toBeNull()
  })

  it('invalidateIfMismatch clears cache for unexpected node', () => {
    const p = makePrefetcher()
    p.prefetch('node_4', { query: 'q', context: 'c' })
    p.invalidateIfMismatch('node_other')
    expect(p.get('node_4')).toBeNull()
  })

  it('invalidateIfMismatch keeps cache when node matches', () => {
    const p = makePrefetcher()
    p.prefetch('node_5', { query: 'q', context: 'c' })
    p.invalidateIfMismatch('node_5')
    expect(p.get('node_5')).not.toBeNull()
  })

  it('getStats tracks hits and misses', () => {
    const p = makePrefetcher()
    p.prefetch('node_6', { query: 'q', context: 'c' })
    p.get('node_6')
    p.get('missing')
    const stats = p.getStats()
    expect(stats.hits).toBe(1)
    expect(stats.misses).toBe(1)
  })
})
