/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { tracedFederatedQuery } from '../core/store/federated-trace.js'
import type { StoreAdapter } from '../core/store/federated-query.js'

function makeAdapter(storeId: 'graph' | 'memory' | 'provenance' | 'knowledge' | 'rag', data?: unknown[]): StoreAdapter {
  return {
    storeId,
    query: vi.fn().mockResolvedValue(data ?? []),
  }
}

describe('tracedFederatedQuery', () => {
  it('returns trace with unique traceId', async () => {
    const g = makeAdapter('graph', [1])
    const result = await tracedFederatedQuery({ query: 'q' }, [g])
    expect(result.trace.traceId).toBeTruthy()
    expect(typeof result.trace.traceId).toBe('string')
  })

  it('partial=false when all stores succeed', async () => {
    const g = makeAdapter('graph', [1])
    const m = makeAdapter('memory', [2])
    const result = await tracedFederatedQuery({ query: 'q' }, [g, m])
    expect(result.trace.partial).toBe(false)
  })

  it('partial=true when at least one store fails', async () => {
    const g: StoreAdapter = {
      storeId: 'graph',
      query: vi.fn().mockRejectedValue(new Error('fail')),
    }
    const m = makeAdapter('memory', [1])
    const result = await tracedFederatedQuery({ query: 'q' }, [g, m])
    expect(result.trace.partial).toBe(true)
  })

  it('records per-store TraceStep with latencyMs and resultCount', async () => {
    const g = makeAdapter('graph', [1, 2])
    const m = makeAdapter('memory', [3])
    const result = await tracedFederatedQuery({ query: 'q' }, [g, m])
    expect(result.trace.steps).toHaveLength(2)
    expect(result.trace.steps[0].storeId).toBe('graph')
    expect(result.trace.steps[0].resultCount).toBe(2)
    expect(result.trace.steps[0].latencyMs).toBeGreaterThanOrEqual(0)
    expect(result.trace.steps[1].storeId).toBe('memory')
    expect(result.trace.steps[1].resultCount).toBe(1)
  })

  it('marks error on failed store step with error string and resultCount=0', async () => {
    const g: StoreAdapter = {
      storeId: 'graph',
      query: vi.fn().mockRejectedValue(new Error('db down')),
    }
    const result = await tracedFederatedQuery({ query: 'q' }, [g])
    expect(result.trace.steps).toHaveLength(1)
    expect(result.trace.steps[0].error).toBe('db down')
    expect(result.trace.steps[0].resultCount).toBe(0)
    expect(result.trace.steps[0].latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('stores are queried sequentially preserving step order', async () => {
    const order: string[] = []
    const g: StoreAdapter = {
      storeId: 'graph',
      query: vi.fn().mockImplementation(async () => {
        order.push('graph')
        return [1]
      }),
    }
    const m: StoreAdapter = {
      storeId: 'memory',
      query: vi.fn().mockImplementation(async () => {
        order.push('memory')
        return [2]
      }),
    }
    await tracedFederatedQuery({ query: 'q' }, [g, m])
    expect(order).toEqual(['graph', 'memory'])
  })

  it('warnings array matches failed stores', async () => {
    const g: StoreAdapter = {
      storeId: 'graph',
      query: vi.fn().mockRejectedValue(new Error('timeout')),
    }
    const m = makeAdapter('memory', [{ x: 1 }])
    const result = await tracedFederatedQuery({ query: 'q' }, [g, m])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('graph')
  })

  it('items carry source_store provenance', async () => {
    const g = makeAdapter('graph', [{ id: 1 }])
    const m = makeAdapter('memory', [{ id: 2 }])
    const result = await tracedFederatedQuery({ query: 'q' }, [g, m])
    expect(result.items[0].source_store).toBe('graph')
    expect(result.items[1].source_store).toBe('memory')
  })

  it('queries only requested stores when filter is provided', async () => {
    const g = makeAdapter('graph', [1])
    const m = makeAdapter('memory', [2])
    const result = await tracedFederatedQuery({ query: 'q', stores: ['graph'] }, [g, m])
    expect(result.trace.steps).toHaveLength(1)
    expect(result.trace.steps[0].storeId).toBe('graph')
    expect(g.query).toHaveBeenCalledOnce()
    expect(m.query).not.toHaveBeenCalled()
  })
})
