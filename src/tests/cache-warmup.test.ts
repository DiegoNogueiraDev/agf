import { describe, it, expect, vi } from 'vitest'
import { warmupCache, WARMUP_COMMANDS } from '../tui/slash/cache-warmup.js'
import { SessionCache } from '../tui/slash/session-cache.js'

describe('WARMUP_COMMANDS', () => {
  it('contains exactly 6 commands', () => {
    expect(WARMUP_COMMANDS).toHaveLength(6)
    expect(WARMUP_COMMANDS).toEqual(['stats', 'metrics', 'phase', 'skills', 'principles', 'provider'])
  })
})

describe('warmupCache', () => {
  it('calls all 6 cache methods', async () => {
    const cache = {
      stats: vi.fn(),
      metrics: vi.fn(),
      getPhase: vi.fn(),
      listSkills: vi.fn(),
      principles: vi.fn(),
      providers: vi.fn(),
    } as unknown as SessionCache

    await warmupCache(cache)

    expect(cache.stats).toHaveBeenCalledTimes(1)
    expect(cache.metrics).toHaveBeenCalledTimes(1)
    expect(cache.getPhase).toHaveBeenCalledTimes(1)
    expect(cache.listSkills).toHaveBeenCalledTimes(1)
    expect(cache.principles).toHaveBeenCalledTimes(1)
    expect(cache.providers).toHaveBeenCalledTimes(1)
  })

  it('silently catches errors from methods', async () => {
    const cache = {
      stats: vi.fn().mockImplementation(() => {
        throw new Error('fail')
      }),
      metrics: vi.fn().mockImplementation(() => {
        throw new Error('fail')
      }),
      getPhase: vi.fn().mockImplementation(() => {
        throw new Error('fail')
      }),
      listSkills: vi.fn().mockImplementation(() => {
        throw new Error('fail')
      }),
      principles: vi.fn().mockImplementation(() => {
        throw new Error('fail')
      }),
      providers: vi.fn().mockImplementation(() => {
        throw new Error('fail')
      }),
    } as unknown as SessionCache

    await expect(warmupCache(cache)).resolves.toBeUndefined()
  })
})
