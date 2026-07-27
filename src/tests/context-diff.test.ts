/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { contextDiff, type ContextChunk } from '../core/context/context-diff.js'
import { SeenSketch } from '../core/economy/seen-sketch.js'

const chunk = (key: string, text: string): ContextChunk => ({ key, text })

describe('contextDiff (predictive-coding: send only the surprise)', () => {
  it('sends the full context on the first turn (empty prior)', () => {
    const sketch = new SeenSketch()
    const chunks = [chunk('a', 'alpha payload'), chunk('b', 'beta payload')]
    const out = contextDiff(chunks, sketch)
    expect(out.fresh.map((c) => c.key)).toEqual(['a', 'b'])
    expect(out.skippedIndices).toEqual([])
    expect(out.savedTokens).toBe(0)
  })

  it('skips chunks already seen on a later turn and reports the saving', () => {
    const sketch = new SeenSketch()
    const chunks = [chunk('a', 'alpha payload here'), chunk('b', 'beta payload here')]
    contextDiff(chunks, sketch) // turn 1 — primes the prior
    const out = contextDiff(chunks, sketch) // turn 2 — all already sent
    expect(out.fresh).toHaveLength(0)
    expect(out.skippedIndices).toEqual([0, 1])
    expect(out.savedTokens).toBeGreaterThan(0)
  })

  it('sends only the surprising (new) chunk in a mixed turn', () => {
    const sketch = new SeenSketch()
    contextDiff([chunk('a', 'alpha')], sketch)
    const out = contextDiff([chunk('a', 'alpha'), chunk('c', 'gamma novelty')], sketch)
    expect(out.fresh.map((c) => c.key)).toEqual(['c'])
    expect(out.skippedIndices).toEqual([0])
  })

  it('marks freshly-sent chunks as seen (so they are skipped next time)', () => {
    const sketch = new SeenSketch()
    const c = [chunk('x', 'x-payload')]
    expect(contextDiff(c, sketch).fresh).toHaveLength(1)
    expect(contextDiff(c, sketch).fresh).toHaveLength(0)
  })

  it('handles an empty chunk list', () => {
    expect(contextDiff([], new SeenSketch())).toEqual({ fresh: [], skippedIndices: [], savedTokens: 0 })
  })
})
