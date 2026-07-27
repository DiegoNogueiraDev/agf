/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { consolidateTraces, type MemoryTrace } from '../core/memory/sleep-consolidation.js'

const para = (topic: string, n = 30): string =>
  Array.from({ length: n }, (_, i) => `${topic} clause ${i} describing the topic in detail.`).join(' ')

const trace = (key: string, salience: number, content: string): MemoryTrace => ({ key, salience, content })

describe('consolidateTraces (synaptic homeostasis / SHY)', () => {
  it('downscales salience multiplicatively while preserving relative order', () => {
    const out = consolidateTraces([trace('a', 10, para('alpha')), trace('b', 4, para('beta'))], {
      downscale: 0.5,
      floor: 0,
    })
    const a = out.consolidated.find((t) => t.key === 'a')!
    const b = out.consolidated.find((t) => t.key === 'b')!
    expect(a.salience).toBeCloseTo(5, 5)
    expect(b.salience).toBeCloseTo(2, 5)
    expect(a.salience).toBeGreaterThan(b.salience)
  })

  it('merges near-duplicate traces and sums their salience', () => {
    const shared = para('payment flow')
    const out = consolidateTraces(
      [trace('p1', 4, shared), trace('p2', 3, shared + ' '), trace('u', 5, para('user profile'))],
      { downscale: 1, floor: 0, mergeThreshold: 0.3 },
    )
    expect(out.merged).toBe(1)
    expect(out.consolidated).toHaveLength(2)
    const payment = out.consolidated.find((t) => t.content.includes('payment'))!
    expect(payment.salience).toBeCloseTo(7, 5) // 4 + 3 summed
  })

  it('drops traces whose downscaled salience falls below the floor', () => {
    const out = consolidateTraces([trace('strong', 10, para('keepme')), trace('weak', 1, para('dropme'))], {
      downscale: 0.5,
      floor: 1,
    })
    expect(out.consolidated.map((t) => t.key)).toEqual(['strong'])
    expect(out.dropped).toBe(1)
  })

  it('is structurally idempotent — a second pass over well-above-floor traces re-merges nothing', () => {
    const traces = [trace('a', 100, para('alpha')), trace('b', 100, para('beta'))]
    const once = consolidateTraces(traces, { downscale: 0.9, floor: 0, mergeThreshold: 0.3 })
    const twice = consolidateTraces(once.consolidated, { downscale: 0.9, floor: 0, mergeThreshold: 0.3 })
    expect(twice.merged).toBe(0)
    expect(twice.consolidated.map((t) => t.key).sort()).toEqual(['a', 'b'])
  })

  it('handles the empty set', () => {
    expect(consolidateTraces([])).toEqual({ consolidated: [], dropped: 0, merged: 0 })
  })
})
