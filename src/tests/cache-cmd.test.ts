/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { runCacheLiveZone } from '../cli/commands/cache-cmd.js'

describe('runCacheLiveZone — CLI surface for core/economy/live-zone.ts (WIRE)', () => {
  // AC: GIVEN a JSON message array WHEN parsed THEN the frozen/live boundary matches getLiveZone
  it('computes frozenEnd/liveStart from a JSON-encoded message array', () => {
    const raw = JSON.stringify([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: 'what is this code' },
    ])
    const zone = runCacheLiveZone(raw)
    expect(zone.frozenEnd).toBe(2)
    expect(zone.liveStart).toBe(2)
  })

  // AC: GIVEN an empty JSON array WHEN parsed THEN both boundaries are 0
  it('returns zero boundaries for an empty message array', () => {
    const zone = runCacheLiveZone('[]')
    expect(zone.frozenEnd).toBe(0)
    expect(zone.liveStart).toBe(0)
  })

  // AC: GIVEN malformed JSON WHEN parsed THEN a descriptive error is thrown (not a raw parse crash)
  it('throws a descriptive error on malformed JSON', () => {
    expect(() => runCacheLiveZone('not json')).toThrow(/invalid JSON/i)
  })

  // AC: GIVEN valid JSON that is not an array WHEN parsed THEN a descriptive error is thrown
  it('throws a descriptive error when the JSON is not an array', () => {
    expect(() => runCacheLiveZone('{"role":"user"}')).toThrow(/array/i)
  })
})
