/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_40e6d72efabd — canonical-hasher: deterministic local receipt (no network)
 * that closes the `proven` tier offline. Ported from graph-flow.
 */
import { describe, it, expect } from 'vitest'
import { hashNodeCanonical, canonicalSerialize } from '../core/provenance/canonical-hasher.js'

describe('canonical-hasher (#node_40e6d72efabd)', () => {
  it('is invariant to object key order', () => {
    expect(hashNodeCanonical({ a: 1, b: 2 })).toBe(hashNodeCanonical({ b: 2, a: 1 }))
  })

  it('is invariant to surrounding whitespace in strings', () => {
    expect(hashNodeCanonical({ k: '  hi  ' })).toBe(hashNodeCanonical({ k: 'hi' }))
  })

  it('changes when a value changes (semantic difference)', () => {
    expect(hashNodeCanonical({ a: 1 })).not.toBe(hashNodeCanonical({ a: 2 }))
  })

  it('is sensitive to array order', () => {
    expect(hashNodeCanonical([1, 2])).not.toBe(hashNodeCanonical([2, 1]))
  })

  it('produces a 64-char hex sha256 digest', () => {
    expect(hashNodeCanonical({ any: 'thing' })).toMatch(/^[0-9a-f]{64}$/)
  })

  it('drops undefined fields deterministically', () => {
    expect(canonicalSerialize({ a: 1, b: undefined })).toBe(canonicalSerialize({ a: 1 }))
  })
})
