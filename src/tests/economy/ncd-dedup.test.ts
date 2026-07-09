/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { ncd, dedupeByNCD } from '../../core/economy/ncd-dedup.js'

describe('ncd-dedup — ncd', () => {
  it('strings idênticas têm NCD 0', () => {
    const d = ncd('hello world', 'hello world')
    expect(d).toBe(0)
  })

  it('strings diferentes têm NCD maior que 0', () => {
    const d = ncd('abc', 'xyz123')
    expect(d).toBeGreaterThan(0)
  })

  it('NCD é simétrico', () => {
    const a = 'the quick brown fox'
    const b = 'the quick brown dog'
    expect(ncd(a, b)).toBeCloseTo(ncd(b, a), 2)
  })
})

describe('ncd-dedup — dedupeByNCD', () => {
  it('deduplica chunks muito similares', () => {
    const chunks = [
      'the quick brown fox jumps over the lazy dog',
      'the quick brown fox jumps over the lazy dog',
      'completely different content here',
    ]
    const result = dedupeByNCD(chunks, { threshold: 0.3 })
    expect(result.kept.length).toBeLessThan(chunks.length)
    expect(result.droppedIndices.length).toBeGreaterThan(0)
  })

  it('mantém chunks diferentes quando threshold é baixo', () => {
    const chunks = ['aaa', 'bbb', 'ccc']
    const result = dedupeByNCD(chunks, { threshold: 0.1 })
    expect(result.kept.length).toBe(3)
    expect(result.droppedIndices.length).toBe(0)
  })
})
