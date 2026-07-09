/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * AUDIT-045 [MED, LATENT]: routeContent adopts any shorter output — including a
 * lossy JSON N-array truncation and an AST function-body drop — with no semantic
 * verify and, absent caller CCR-wrapping, no reversibility. Fix (additive,
 * back-compat): report whether the adopted compression is `lossy`, and add an
 * opt-in `verify` gate that refuses to adopt a non-reversible lossy drop
 * (falls back to the lossless result for the content type).
 */
import { describe, it, expect } from 'vitest'
import { routeContent } from '../core/economy/content-router.js'

// Homogeneous JSON array, large enough (>256 bytes) to trigger summarization.
const bigArray = JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ id: i, name: `n${i}`, ok: true })))

describe('AUDIT-045: lossy compression is reported and gated behind verify', () => {
  it('reports lossy=true when adopting a lossy JSON summary (default behavior unchanged)', () => {
    const r = routeContent(bigArray)
    expect(r.bytesAfter).toBeLessThan(r.bytesBefore) // still compresses by default
    expect(r.compressor).toBe('json-summarizer')
    expect(r.lossy).toBe(true)
  })

  it('with verify, a non-reversible lossy summary is NOT adopted (output is the original)', () => {
    const r = routeContent(bigArray, { verify: true })
    expect(r.output).toBe(bigArray)
    expect(r.compressor).toBe('identity')
    expect(r.lossy).toBe(false)
    expect(r.saved).toBe(0)
  })

  it('lossless / unchanged paths are never flagged lossy', () => {
    const small = '{"a":1}' // below JSON min-compress → passthrough
    const r = routeContent(small)
    expect(r.output).toBe(small)
    expect(r.lossy).toBe(false)
  })
})
