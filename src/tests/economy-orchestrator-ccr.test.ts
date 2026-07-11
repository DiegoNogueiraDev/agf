/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task A4 — CCR lever wiring in the economy orchestrator. Unit-tests the pure
 * decision helper `applyCcrToRouted` (extracted to avoid policy/env coupling)
 * plus the shared `ccrMarker` format.
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { applyCcrToRouted } from '../core/economy/economy-orchestrator.js'
import { CcrStore, ccrMarker } from '../core/economy/ccr-store.js'

const CCR_MARKER = /⟨ccr:([0-9a-f]{64})⟩/

describe('ccrMarker — shared marker format', () => {
  it('formats a hash as ⟨ccr:HASH⟩ (matching the A2 lossy-gate convention)', () => {
    const hash = CcrStore.hashOf('hello')
    expect(ccrMarker(hash)).toBe(`⟨ccr:${hash}⟩`)
  })
})

describe('applyCcrToRouted — per-message CCR decision (Task A4)', () => {
  const original = 'word '.repeat(120) // 600 bytes of routable tool content
  const routedOutput = original.slice(0, 200)
  const routedSaved = original.length - routedOutput.length

  it('AC1: with an active ccr store, caches the original, injects the marker, and reports ccr_dropped', () => {
    const db = new Database(':memory:')
    const ccr = new CcrStore(db)

    const r = applyCcrToRouted(original, routedOutput, routedSaved, ccr)

    expect(r.outcome).toBe('ccr_dropped')
    const match = CCR_MARKER.exec(r.content)
    expect(match).not.toBeNull()
    const hash = match![1]
    expect(hash).toBe(CcrStore.hashOf(original))
    // content = routedOutput + '\n' + marker
    expect(r.content).toBe(`${routedOutput}\n${ccrMarker(hash)}`)
    // original is retrievable byte-for-byte from a FRESH store over the same db
    expect(new CcrStore(db).get(hash)).toBe(original)
  })

  it('AC2: saved is recomputed after marker injection (textBefore - finalLength)', () => {
    const db = new Database(':memory:')
    const ccr = new CcrStore(db)

    const r = applyCcrToRouted(original, routedOutput, routedSaved, ccr)

    expect(r.saved).toBe(original.length - r.content.length)
    expect(r.saved).toBeGreaterThan(0)
  })

  it('AC3: without a ccr store (null), behaves exactly as before — accepted, no marker, identical content', () => {
    const r = applyCcrToRouted(original, routedOutput, routedSaved, null)

    expect(r.outcome).toBe('accepted')
    expect(CCR_MARKER.test(r.content)).toBe(false)
    expect(r.content).toBe(routedOutput)
    expect(r.saved).toBe(routedSaved)
  })

  it('falls back to plain accepted (no marker) when the marker makes the result not smaller than textBefore', () => {
    const db = new Database(':memory:')
    const ccr = new CcrStore(db)
    // routed output barely shorter than original; the ~70-byte marker pushes the
    // marked content to >= original length → fall back to accepted (no marker).
    const barelyShorter = original.slice(0, original.length - 5)
    const r = applyCcrToRouted(original, barelyShorter, original.length - barelyShorter.length, ccr)

    expect(r.outcome).toBe('accepted')
    expect(CCR_MARKER.test(r.content)).toBe(false)
    expect(r.content).toBe(barelyShorter)
    expect(r.saved).toBe(original.length - barelyShorter.length)
  })
})
