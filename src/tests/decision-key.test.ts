/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { decisionKey, normalizeInputSignature } from '../core/learning/decision-key.js'

describe('decisionKey', () => {
  const base = { domain: 'src/core/learning', phase: 'BUILD', role: 'implementer', input: 'route TDD task' }

  // AC1: GIVEN the same (domain,phase,role,input) WHEN keyed twice THEN identical deterministic keys
  it('is deterministic — same context yields the same key across calls', () => {
    expect(decisionKey(base)).toBe(decisionKey({ ...base }))
  })

  // AC2: GIVEN differing inputs WHEN keyed THEN distinct keys
  it('produces distinct keys when any field differs', () => {
    const k = decisionKey(base)
    expect(decisionKey({ ...base, input: 'route a different task' })).not.toBe(k)
    expect(decisionKey({ ...base, domain: 'src/core/economy' })).not.toBe(k)
    expect(decisionKey({ ...base, phase: 'SHAPE' })).not.toBe(k)
    expect(decisionKey({ ...base, role: 'reviewer' })).not.toBe(k)
  })

  // AC2 cont.: field boundaries don't collide (no concatenation ambiguity)
  it('does not collide across field-boundary shifts', () => {
    const a = decisionKey({ domain: 'ab', phase: 'c', role: 'd', input: 'e' })
    const b = decisionKey({ domain: 'a', phase: 'bc', role: 'd', input: 'e' })
    expect(a).not.toBe(b)
  })

  // AC3: GIVEN input with volatile noise (timestamp/uuid) WHEN normalized THEN the key ignores the noise
  it('ignores volatile timestamp/uuid/epoch noise in the input', () => {
    const k1 = decisionKey({
      ...base,
      input: 'started at 2026-06-17T14:10:35.123Z id=550e8400-e29b-41d4-a716-446655440000',
    })
    const k2 = decisionKey({
      ...base,
      input: 'started at 2025-01-02T09:00:00.000Z id=11111111-2222-3333-4444-555555555555',
    })
    expect(k1).toBe(k2)
    // epoch-ms noise too
    const e1 = decisionKey({ ...base, input: 'ts=1718633435123 payload' })
    const e2 = decisionKey({ ...base, input: 'ts=1700000000000 payload' })
    expect(e1).toBe(e2)
  })

  it('returns a stable 64-char hex sha256 digest', () => {
    expect(decisionKey(base)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('normalizeInputSignature', () => {
  it('replaces ISO timestamps, UUIDs and epoch integers with stable placeholders', () => {
    const norm = normalizeInputSignature(
      'run 2026-06-17T14:10:35Z uuid 550e8400-e29b-41d4-a716-446655440000 epoch 1718633435123',
    )
    expect(norm).not.toMatch(/2026-06-17/)
    expect(norm).not.toMatch(/550e8400/)
    expect(norm).not.toMatch(/1718633435123/)
    expect(norm).toContain('<ts>')
    expect(norm).toContain('<uuid>')
  })

  it('preserves meaningful short numbers', () => {
    expect(normalizeInputSignature('retry 3 of 5')).toBe('retry 3 of 5')
  })

  it('collapses whitespace deterministically', () => {
    expect(normalizeInputSignature('a   b\n\tc')).toBe('a b c')
  })
})
