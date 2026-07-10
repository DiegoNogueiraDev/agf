/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_c888bebd9e75 — Tests for applyCcrToRouted pure function
 * AC: GIVEN applyCcrToRouted WHEN ccr null THEN returns accepted path unchanged
 * AC: GIVEN ccr active WHEN marker shrinks content THEN returns ccr_dropped
 * AC: GIVEN ccr active WHEN marker does not shrink THEN falls back to accepted
 */
import { describe, it, expect } from 'vitest'
import { applyCcrToRouted } from '../core/economy/economy-orchestrator.js'
import type { CcrLike } from '../core/economy/lossy-gate.js'

function makeCcr(hash = 'abc123'): CcrLike {
  return { put: () => hash }
}

describe('applyCcrToRouted', () => {
  it('returns accepted path unchanged when ccr is null', () => {
    const result = applyCcrToRouted('long original content here', 'short', 20, null)
    expect(result).toEqual({ content: 'short', saved: 20, outcome: 'accepted' })
  })

  it('returns ccr_dropped with marker when marker makes content smaller than original', () => {
    // originalContent must be longer than routedOutput + marker
    // marker = '\n⟨ccr:abc123⟩' = 15 chars
    // original = 200 chars, routedOutput = 'x', marked = 'x\n⟨ccr:abc123⟩' = ~16 chars < 200
    const original = 'a'.repeat(200)
    const routed = 'x'
    const routedSaved = original.length - routed.length
    const result = applyCcrToRouted(original, routed, routedSaved, makeCcr('abc123'))

    expect(result.outcome).toBe('ccr_dropped')
    expect(result.content).toContain('⟨ccr:abc123⟩')
    expect(result.content).toContain(routed)
    expect(result.saved).toBe(original.length - result.content.length)
  })

  it('falls back to accepted when marker does not reduce size below original', () => {
    // original is very short, routed is same, marker makes it longer than original
    const original = 'hi'
    const routed = 'h'
    const routedSaved = 1
    const result = applyCcrToRouted(original, routed, routedSaved, makeCcr('x'))

    // marker '\n⟨ccr:x⟩' = 10 chars, so 'h' + marker = 11 > 'hi'.length = 2 → fallback
    expect(result.outcome).toBe('accepted')
    expect(result.content).toBe(routed)
    expect(result.saved).toBe(routedSaved)
  })

  it('calls ccr.put with the original content', () => {
    const calls: string[] = []
    const ccr: CcrLike = {
      put(original: string) {
        calls.push(original)
        return 'hash999'
      },
    }
    const original = 'b'.repeat(200)
    applyCcrToRouted(original, 'c', 199, ccr)
    expect(calls).toEqual([original])
  })
})
