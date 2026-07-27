/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { ncd, dedupeByNCD } from '../core/economy/ncd-dedup.js'

const para = (topic: string, n = 40): string =>
  Array.from({ length: n }, (_, i) => `${topic} sentence number ${i} about the matter.`).join(' ')

describe('ncd (Normalized Compression Distance, gzip)', () => {
  it('is near zero for identical content', () => {
    const a = para('auth')
    expect(ncd(a, a)).toBeLessThan(0.2)
  })

  it('is larger for dissimilar content than for identical content', () => {
    const a = para('authentication and token rotation')
    const b = para('quantum chromodynamics and gluon fields')
    expect(ncd(a, b)).toBeGreaterThan(ncd(a, a))
  })

  it('is symmetric within tolerance', () => {
    const a = para('alpha')
    const b = para('beta beta beta')
    expect(Math.abs(ncd(a, b) - ncd(b, a))).toBeLessThan(0.05)
  })
})

describe('dedupeByNCD', () => {
  it('drops a near-duplicate chunk and keeps distinct ones', () => {
    const a = para('payment processing flow')
    const aDup = a + ' ' // trivially near-identical
    const b = para('user profile settings page')

    const out = dedupeByNCD([a, aDup, b], { threshold: 0.3 })
    expect(out.kept).toHaveLength(2)
    expect(out.droppedIndices).toEqual([1])
  })

  it('keeps everything when all chunks are distinct', () => {
    const out = dedupeByNCD([para('one topic'), para('different subject'), para('third unrelated thing')], {
      threshold: 0.2,
    })
    expect(out.kept).toHaveLength(3)
    expect(out.droppedIndices).toEqual([])
  })

  it('a stricter (smaller) threshold drops fewer near-duplicates', () => {
    const a = para('shared core idea')
    const aVariant = para('shared core idea') + ' extra tail clause here.'
    const loose = dedupeByNCD([a, aVariant], { threshold: 0.5 })
    const strict = dedupeByNCD([a, aVariant], { threshold: 0.01 })
    expect(loose.kept.length).toBeLessThanOrEqual(strict.kept.length)
  })

  it('handles the empty list', () => {
    expect(dedupeByNCD([])).toEqual({ kept: [], droppedIndices: [] })
  })
})
