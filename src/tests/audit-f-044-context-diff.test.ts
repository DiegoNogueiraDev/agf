/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * AUDIT-044 [HIGH]: context-diff skips a chunk on a Bloom membership probe
 * (SeenSketch.has), but Bloom filters have false POSITIVES — a FP collapses a
 * never-sent tool message to a marker with no CCR, irreversibly dropping it.
 * Fix: confirm identity on a skip (exact membership) before collapsing.
 */
import { describe, it, expect } from 'vitest'
import { contextDiff } from '../core/context/context-diff.js'
import { SeenSketch } from '../core/economy/seen-sketch.js'

describe('AUDIT-044: context-diff must not drop a never-sent chunk on a Bloom false positive', () => {
  it('a Bloom false-positive key is NOT collapsed (no irreversible data loss)', () => {
    // A 1-bit / 1-hash sketch maps every key to the same bit → guaranteed FP.
    const sketch = new SeenSketch({ bits: 1, hashes: 1 })
    sketch.add('a-seen-key')
    // Bloom now reports membership for ANY key (the false positive).
    expect(sketch.has('never-sent-key')).toBe(true)

    const out = contextDiff(
      [{ key: 'never-sent-key', text: 'a real message that was never sent before this turn' }],
      sketch,
    )

    // The chunk was never actually sent → it must be forwarded, not skipped.
    expect(out.skippedIndices).toEqual([])
    expect(out.fresh.map((c) => c.key)).toEqual(['never-sent-key'])
  })

  it('still skips a chunk that was genuinely sent earlier (true positive)', () => {
    const sketch = new SeenSketch()
    contextDiff([{ key: 'k', text: 'hello payload here' }], sketch) // turn 1 — primes prior
    const out = contextDiff([{ key: 'k', text: 'hello payload here' }], sketch) // turn 2
    expect(out.skippedIndices).toEqual([0])
    expect(out.fresh).toHaveLength(0)
    expect(out.savedTokens).toBeGreaterThan(0)
  })
})
