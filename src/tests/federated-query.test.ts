/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { federatedQuery } from '../core/store/federated-query.js'
import type { StoreAdapter } from '../core/store/federated-query.js'

function makeAdapter(storeId: 'graph' | 'memory' | 'provenance' | 'knowledge' | 'rag', data?: unknown[]): StoreAdapter {
  return {
    storeId,
    query: vi.fn().mockResolvedValue(data ?? []),
  }
}

describe('federatedQuery', () => {
  it('returns empty result when no adapters provided', async () => {
    const result = await federatedQuery({ query: 'SELECT 1' }, [])
    expect(result.items).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('queries all adapters when stores filter is omitted', async () => {
    const g = makeAdapter('graph', [{ id: 1 }])
    const m = makeAdapter('memory', [{ id: 2 }])
    const result = await federatedQuery({ query: 'test' }, [g, m])
    expect(result.items).toHaveLength(2)
    expect(result.items[0].source_store).toBe('graph')
    expect(result.items[1].source_store).toBe('memory')
    expect(result.warnings).toEqual([])
  })

  it('queries only requested stores when filter is provided', async () => {
    const g = makeAdapter('graph', [{ id: 1 }])
    const m = makeAdapter('memory', [{ id: 2 }])
    const result = await federatedQuery({ query: 'test', stores: ['graph'] }, [g, m])
    expect(result.items).toHaveLength(1)
    expect(result.items[0].source_store).toBe('graph')
    expect(g.query).toHaveBeenCalledWith('test')
    expect(m.query).not.toHaveBeenCalled()
  })

  it('collects warnings when a store is unavailable', async () => {
    const g: StoreAdapter = {
      storeId: 'graph',
      query: vi.fn().mockRejectedValue(new Error('connection refused')),
    }
    const m = makeAdapter('memory', [{ id: 1 }])
    const result = await federatedQuery({ query: 'test' }, [g, m])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('graph')
    expect(result.warnings[0]).toContain('connection refused')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].source_store).toBe('memory')
  })

  it('handles non-Error rejection gracefully', async () => {
    const g: StoreAdapter = {
      storeId: 'graph',
      query: vi.fn().mockRejectedValue('string error'),
    }
    const result = await federatedQuery({ query: 'test' }, [g])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('string error')
  })

  it('partially fails: collects items from successful stores and warnings from failed ones', async () => {
    const g: StoreAdapter = {
      storeId: 'graph',
      query: vi.fn().mockRejectedValue(new Error('timeout')),
    }
    const m: StoreAdapter = {
      storeId: 'memory',
      query: vi.fn().mockResolvedValue([{ x: 1 }, { x: 2 }]),
    }
    const k: StoreAdapter = {
      storeId: 'knowledge',
      query: vi.fn().mockRejectedValue(new Error('offline')),
    }
    const result = await federatedQuery({ query: 'test' }, [g, m, k])
    expect(result.items).toHaveLength(2)
    expect(result.warnings).toHaveLength(2)
    expect(result.warnings[0]).toContain('graph')
    expect(result.warnings[1]).toContain('knowledge')
  })

  it('merges results from multiple stores with source_store provenance', async () => {
    const g = makeAdapter('graph', [{ a: 1 }, { a: 2 }])
    const m = makeAdapter('memory', [{ b: 3 }])
    const result = await federatedQuery({ query: 'SELECT *' }, [g, m])
    expect(result.items).toHaveLength(3)
    expect(result.items.filter((i) => i.source_store === 'graph')).toHaveLength(2)
    expect(result.items.filter((i) => i.source_store === 'memory')).toHaveLength(1)
  })

  it('appends per-item source_store to every result item', async () => {
    const adapters = ['graph', 'memory', 'knowledge', 'provenance', 'rag'] as const
    const all = adapters.map((id) => makeAdapter(id, [{ id }]))
    const result = await federatedQuery({ query: 'q' }, all)
    for (const item of result.items) {
      expect(item.source_store).toBeDefined()
      expect(adapters).toContain(item.source_store)
    }
    expect(result.items).toHaveLength(5)
  })
})
