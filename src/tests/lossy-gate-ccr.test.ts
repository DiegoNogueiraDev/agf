/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { applyLossyTransform, GateOutcome } from '../core/economy/lossy-gate.js'
import { CcrStore } from '../core/economy/ccr-store.js'

function nlStr(n = 600): string {
  return 'word '.repeat(Math.ceil(n / 5)).slice(0, n)
}

const CCR_MARKER = /⟨ccr:([0-9a-f]{64})⟩/

describe('lossy-gate CCR wiring (Task A2)', () => {
  it('AC1: accepted compression with ccr returns ccr_dropped + marker referencing the stored hash', async () => {
    const ccr = new CcrStore(new Database(':memory:'))
    const orig = nlStr(600)

    const r = await applyLossyTransform<string>({
      original: orig,
      transform: (s: string) => s.slice(0, 200),
      kind: 'nl',
      ccr,
    })

    expect(r.outcome).toBe('ccr_dropped')
    expect(r.outcome).toBe(GateOutcome.ccr_dropped)
    const match = CCR_MARKER.exec(r.value)
    expect(match).not.toBeNull()
    const hash = match![1]
    expect(hash).toBe(CcrStore.hashOf(orig))
  })

  it('AC2: original is retrievable byte-for-byte via the marker hash', async () => {
    const ccr = new CcrStore(new Database(':memory:'))
    const orig = nlStr(600)

    const r = await applyLossyTransform<string>({
      original: orig,
      transform: (s: string) => s.slice(0, 200),
      kind: 'nl',
      ccr,
    })

    const match = CCR_MARKER.exec(r.value)
    expect(match).not.toBeNull()
    const hash = match![1]
    expect(ccr.get(hash)).toBe(orig)
  })

  it('AC2b: saved is recomputed after marker injection and stays positive', async () => {
    const ccr = new CcrStore(new Database(':memory:'))
    const orig = nlStr(600)

    const r = await applyLossyTransform<string>({
      original: orig,
      transform: (s: string) => s.slice(0, 200),
      kind: 'nl',
      ccr,
    })

    const originalBytes = new TextEncoder().encode(orig).length
    const finalBytes = new TextEncoder().encode(r.value).length
    expect(r.saved).toBe(originalBytes - finalBytes)
    expect(r.saved).toBeGreaterThan(0)
  })

  it('AC3: ccr_dropped outcome equals the ledger-recognized GateOutcome.ccr_dropped', () => {
    expect(GateOutcome.ccr_dropped).toBe('ccr_dropped')
  })

  it('AC4: without ccr, the same accepted compression returns accepted and NO marker', async () => {
    const orig = nlStr(600)

    const r = await applyLossyTransform<string>({
      original: orig,
      transform: (s: string) => s.slice(0, 200),
      kind: 'nl',
    })

    expect(r.outcome).toBe('accepted')
    expect(CCR_MARKER.test(r.value)).toBe(false)
    expect(r.value).toBe(orig.slice(0, 200))
  })

  it('falls back to accepted (no marker) when marker injection makes the result not smaller', async () => {
    const ccr = new CcrStore(new Database(':memory:'))
    const orig = nlStr(600)
    // Candidate is only marginally smaller than original; the ~70-byte marker
    // pushes the final value back to >= original size → fall back to accepted.
    const candidate = orig.slice(0, orig.length - 10)

    const r = await applyLossyTransform<string>({
      original: orig,
      transform: () => candidate,
      kind: 'nl',
      ccr,
    })

    expect(r.outcome).toBe('accepted')
    expect(CCR_MARKER.test(r.value)).toBe(false)
    expect(r.value).toBe(candidate)
  })

  it('does not invoke CCR for non-string values', async () => {
    let called = false
    const ccr = {
      put(original: string, _contentType?: string): string {
        called = true
        return CcrStore.hashOf(original)
      },
    }

    const bigObj = { items: Array.from({ length: 200 }, (_, i) => ({ i, v: 'x'.repeat(10) })) }
    const r = await applyLossyTransform<typeof bigObj>({
      original: bigObj,
      transform: () => ({ items: [{ i: 0, v: 'x' }] }),
      kind: 'nl',
      ccr,
    })

    expect(called).toBe(false)
    expect(r.outcome).toBe('accepted')
  })

  it('does not invoke CCR on reverted (no-shrink) path', async () => {
    let called = false
    const ccr = {
      put(original: string, _contentType?: string): string {
        called = true
        return CcrStore.hashOf(original)
      },
    }
    const orig = nlStr(600)

    const r = await applyLossyTransform<string>({
      original: orig,
      transform: (s: string) => s + '!',
      kind: 'nl',
      ccr,
    })

    expect(called).toBe(false)
    expect(r.outcome).toBe('reverted')
    expect(r.value).toBe(orig)
  })
})
