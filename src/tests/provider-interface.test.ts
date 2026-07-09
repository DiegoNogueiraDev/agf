import { describe, it, expect, vi } from 'vitest'
import { MemoryProviderRegistry } from '../core/memory/provider-interface.js'
import type { MemoryProvider, MemoryResult, ConversationContext } from '../core/memory/provider-interface.js'

function makeCtx(overrides: Partial<ConversationContext> = {}): ConversationContext {
  return { sessionId: 's1', recentMessages: [], ...overrides }
}

function makeResult(id: string): MemoryResult {
  return { id, content: `content-${id}`, source: 'test' }
}

function makeProvider(name: string, results: MemoryResult[] = []): MemoryProvider {
  return {
    name,
    prefetch: vi.fn().mockResolvedValue(results),
    syncTurn: vi.fn().mockResolvedValue(undefined),
    getToolSchemas: vi.fn().mockReturnValue([]),
  }
}

describe('MemoryProviderRegistry', () => {
  it('starts with no providers', () => {
    const registry = new MemoryProviderRegistry()
    expect(registry.getProviders()).toEqual([])
  })

  it('registers a provider', () => {
    const registry = new MemoryProviderRegistry()
    registry.registerProvider(makeProvider('honcho'))
    expect(registry.getProviders()).toHaveLength(1)
    expect(registry.getProviders()[0]?.name).toBe('honcho')
  })

  it('replaces provider with same name', () => {
    const registry = new MemoryProviderRegistry()
    registry.registerProvider(makeProvider('honcho'))
    registry.registerProvider(makeProvider('honcho'))
    expect(registry.getProviders()).toHaveLength(1)
  })

  it('stores multiple different providers', () => {
    const registry = new MemoryProviderRegistry()
    registry.registerProvider(makeProvider('a'))
    registry.registerProvider(makeProvider('b'))
    expect(registry.getProviders()).toHaveLength(2)
  })

  it('prefetchAll returns empty for no providers', async () => {
    const registry = new MemoryProviderRegistry()
    const results = await registry.prefetchAll(makeCtx())
    expect(results).toEqual([])
  })

  it('prefetchAll merges results from all providers', async () => {
    const registry = new MemoryProviderRegistry()
    registry.registerProvider(makeProvider('a', [makeResult('r1')]))
    registry.registerProvider(makeProvider('b', [makeResult('r2')]))
    const results = await registry.prefetchAll(makeCtx())
    expect(results).toHaveLength(2)
    const ids = results.map((r) => r.id)
    expect(ids).toContain('r1')
    expect(ids).toContain('r2')
  })

  it('prefetchAll deduplicates by id — last provider wins', async () => {
    const registry = new MemoryProviderRegistry()
    registry.registerProvider(makeProvider('a', [{ id: 'shared', content: 'from-a', source: 'a' }]))
    registry.registerProvider(makeProvider('b', [{ id: 'shared', content: 'from-b', source: 'b' }]))
    const results = await registry.prefetchAll(makeCtx())
    expect(results).toHaveLength(1)
    expect(results[0]?.content).toBe('from-b')
  })

  it('prefetchAll skips providers that throw', async () => {
    const registry = new MemoryProviderRegistry()
    const failing: MemoryProvider = {
      name: 'bad',
      prefetch: vi.fn().mockRejectedValue(new Error('network error')),
      syncTurn: vi.fn(),
      getToolSchemas: () => [],
    }
    registry.registerProvider(failing)
    registry.registerProvider(makeProvider('good', [makeResult('ok')]))
    const results = await registry.prefetchAll(makeCtx())
    expect(results).toHaveLength(1)
    expect(results[0]?.id).toBe('ok')
  })
})
