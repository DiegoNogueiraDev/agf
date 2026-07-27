/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { SeenSketch, estimateFalsePositiveRate } from '../core/economy/seen-sketch.js'

describe('SeenSketch (Bloom-filter cross-turn dedup)', () => {
  it('has() is true for every added key — no false negatives', () => {
    const s = new SeenSketch()
    const keys = Array.from({ length: 500 }, (_, i) => `chunk-${i}-payload`)
    for (const k of keys) s.add(k)
    for (const k of keys) expect(s.has(k)).toBe(true)
  })

  it('a fresh sketch reports unseen keys as not present', () => {
    const s = new SeenSketch()
    expect(s.has('never-added')).toBe(false)
    s.add('a')
    expect(s.has('b')).toBe(false)
  })

  it('reset() clears membership', () => {
    const s = new SeenSketch()
    s.add('x')
    expect(s.has('x')).toBe(true)
    s.reset()
    expect(s.has('x')).toBe(false)
    expect(s.size).toBe(0)
  })

  it('size counts add() calls', () => {
    const s = new SeenSketch()
    s.add('a')
    s.add('b')
    expect(s.size).toBe(2)
  })

  it('is deterministic — same keys give the same membership across instances', () => {
    const a = new SeenSketch({ bits: 4096, hashes: 4 })
    const b = new SeenSketch({ bits: 4096, hashes: 4 })
    for (const k of ['one', 'two', 'three']) {
      a.add(k)
      b.add(k)
    }
    for (const probe of ['one', 'four', 'five', 'three']) expect(a.has(probe)).toBe(b.has(probe))
  })

  it('keeps the false-positive rate near the theoretical bound (sublinear membership)', () => {
    const bits = 8192
    const hashes = 4
    const inserted = 200
    const s = new SeenSketch({ bits, hashes })
    for (let i = 0; i < inserted; i++) s.add(`seen-${i}`)

    let fp = 0
    const trials = 5000
    for (let i = 0; i < trials; i++) if (s.has(`unseen-${i}`)) fp++
    const observed = fp / trials
    const theoretical = estimateFalsePositiveRate(bits, hashes, inserted)
    expect(observed).toBeLessThan(theoretical + 0.02) // generous slack over the analytic bound
  })

  it('larger bit arrays lower the false-positive rate', () => {
    expect(estimateFalsePositiveRate(16384, 4, 200)).toBeLessThan(estimateFalsePositiveRate(2048, 4, 200))
  })

  it('rejects non-positive configuration', () => {
    expect(() => new SeenSketch({ bits: 0 })).toThrow()
    expect(() => new SeenSketch({ hashes: 0 })).toThrow()
  })
})
