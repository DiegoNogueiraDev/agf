/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { formatWakeUp, injectWakeUp, createWakeUpHook } from '../core/economy/wake-up-integration.js'
import type { WakeUpResult } from '../core/economy/wake-up.js'

const sampleResult: WakeUpResult = {
  layers: {
    L0: '[L0] Identity: agent-graph-flow',
    L1: '[L1:critical] memory about architecture',
  },
  tokenCounts: { L0: 10, L1: 15, total: 25, remaining: 875 },
  metrics: { itemsIncluded: 1, itemsConsidered: 5, avgRetentionScore: 0.9, avgRrfScore: 0.85 },
}

describe('formatWakeUp', () => {
  it('formats all layers', () => {
    const result = formatWakeUp(sampleResult)
    expect(result).toContain('[L0] Identity')
    expect(result).toContain('[L1:critical]')
  })

  it('includes token counts', () => {
    const result = formatWakeUp(sampleResult)
    expect(result).toContain('25 tok')
    expect(result).toContain('875 remaining')
  })

  it('includes metrics', () => {
    const result = formatWakeUp(sampleResult)
    expect(result).toContain('1/5 items')
  })
})

describe('injectWakeUp', () => {
  it('formats for system prompt injection', () => {
    const result = injectWakeUp(sampleResult)
    expect(result).toMatch(/^## Wake-Up Pack/)
    expect(result).toContain('[L0] Identity')
  })
})

describe('createWakeUpHook', () => {
  it('returns a hook handler that produces WakeUpResult', () => {
    const hook = createWakeUpHook({
      identity: 'test-agent',
      capabilities: ['read', 'write'],
      constraints: [],
    })
    const result = hook()
    expect(result.layers.L0).toContain('test-agent')
    expect(result.metrics.itemsIncluded).toBeGreaterThanOrEqual(0)
  })

  it('wires searchL2/searchL3 (ranked on-demand + deep search) when a query is given', () => {
    const memoryItems: MemoryItem[] = [
      {
        id: 'm1',
        content: 'Cache invalidation is one of the hard problems in CS',
        score: 0.8,
        ageDays: 5,
        bm25Rank: 1,
        vectorRank: 1,
        graphRank: 1,
      },
      {
        id: 'm2',
        content: 'Testing strategy follows the test pyramid model',
        score: 0.85,
        ageDays: 2,
        bm25Rank: 2,
        vectorRank: 2,
        graphRank: 2,
      },
    ]
    const hook = createWakeUpHook({
      identity: 'test-agent',
      capabilities: ['read'],
      constraints: [],
      memoryItems,
      query: 'cache',
    })
    const result = hook()
    expect(result.layers.L2).toContain('[L2:on-demand:cache]')
    expect(result.layers.L2).toContain('Cache invalidation')
    expect(result.layers.L3).toContain('[L3:deep]')
  })

  it('leaves L2/L3 empty when no query is given (unchanged default behavior)', () => {
    const hook = createWakeUpHook({
      identity: 'test-agent',
      capabilities: ['read'],
      constraints: [],
      memoryItems: [
        { id: 'm1', content: 'some memory', score: 0.5, ageDays: 1, bm25Rank: 1, vectorRank: 1, graphRank: 1 },
      ],
    })
    const result = hook()
    expect(result.layers.L2).toBeUndefined()
    expect(result.layers.L3).toBeUndefined()
  })
})
