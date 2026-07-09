/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { computeCognitiveDebt } from '../core/economy/cognitive-debt.js'

describe('computeCognitiveDebt', () => {
  it('reports zero debt in delegate mode (empty ledger)', () => {
    const r = computeCognitiveDebt({ taskTokens: [], totalTasks: 5 })
    expect(r.llmAssistedTasks).toBe(0)
    expect(r.relianceRatio).toBe(0)
    expect(r.level).toBe('none')
    expect(r.avgTokensPerAssistedTask).toBe(0)
  })

  it('counts only tasks with tokens as LLM-assisted', () => {
    const r = computeCognitiveDebt({
      taskTokens: [
        { nodeId: 'a', total: 1200 },
        { nodeId: 'b', total: 0 },
        { nodeId: 'c', total: 800 },
      ],
      totalTasks: 4,
    })
    expect(r.llmAssistedTasks).toBe(2)
    expect(r.totalTokens).toBe(2000)
    expect(r.avgTokensPerAssistedTask).toBe(1000)
    expect(r.relianceRatio).toBeCloseTo(0.5, 5)
    expect(r.level).toBe('moderate')
  })

  it('flags high reliance when most tasks lean on the LLM', () => {
    const r = computeCognitiveDebt({
      taskTokens: [
        { nodeId: 'a', total: 100 },
        { nodeId: 'b', total: 100 },
        { nodeId: 'c', total: 100 },
      ],
      totalTasks: 3,
    })
    expect(r.relianceRatio).toBe(1)
    expect(r.level).toBe('high')
  })

  it('reports low reliance when few tasks used the LLM', () => {
    const r = computeCognitiveDebt({
      taskTokens: [{ nodeId: 'a', total: 500 }],
      totalTasks: 10,
    })
    expect(r.relianceRatio).toBeCloseTo(0.1, 5)
    expect(r.level).toBe('low')
  })

  it('guards against a denominator smaller than assisted tasks', () => {
    // ledger has activity for tasks not counted in totalTasks — ratio never > 1
    const r = computeCognitiveDebt({
      taskTokens: [
        { nodeId: 'a', total: 10 },
        { nodeId: 'b', total: 10 },
      ],
      totalTasks: 0,
    })
    expect(r.relianceRatio).toBeLessThanOrEqual(1)
    expect(r.llmAssistedTasks).toBe(2)
  })

  it('cites the MIT cognitive-debt study in its note', () => {
    const r = computeCognitiveDebt({ taskTokens: [{ nodeId: 'a', total: 10 }], totalTasks: 1 })
    expect(r.note.toLowerCase()).toContain('cognitive')
  })
})
