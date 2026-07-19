/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { ToolOutputStore, toolOutputMarker } from '../core/context/tool-output-store.js'

const big = (n: number): string => 'L' + 'x'.repeat(n) + 'TAIL_ERROR'

describe('ToolOutputStore', () => {
  it('passes small output through unchanged and stores nothing', () => {
    const store = new ToolOutputStore(new Database(':memory:'), { thresholdChars: 2000 })
    const res = store.offload('short output')
    expect(res.stored).toBe(false)
    expect(res.preview).toBe('short output')
    expect(res.hash).toBeNull()
    expect(res.marker).toBeNull()
  })

  // AC: GIVEN output > threshold WHEN stored THEN preview is head-tail and the marker references the hash
  it('truncates large output to head-tail with a hash marker', () => {
    const store = new ToolOutputStore(new Database(':memory:'), { thresholdChars: 2000, previewChars: 400 })
    const out = big(5000)
    const res = store.offload(out)
    expect(res.stored).toBe(true)
    expect(res.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(res.preview.length).toBeLessThan(out.length)
    expect(res.preview).toContain('…[omitido')
    expect(res.preview).toContain(toolOutputMarker(res.hash as string))
    // head-tail preserves the tail (where errors live)
    expect(res.preview).toContain('TAIL_ERROR')
  })

  // AC: GIVEN a stored hash WHEN retrieved THEN the full original is returned byte-identical
  it('retrieves the full original byte-identical by hash', () => {
    const store = new ToolOutputStore(new Database(':memory:'), { thresholdChars: 100 })
    const out = big(5000)
    const { hash } = store.offload(out)
    expect(hash).not.toBeNull()
    expect(store.get(hash as string)).toBe(out)
  })

  it('returns null for an unknown hash', () => {
    const store = new ToolOutputStore(new Database(':memory:'))
    expect(store.get('deadbeef')).toBeNull()
  })

  it('is idempotent on re-instantiation (table already exists)', () => {
    const db = new Database(':memory:')
    new ToolOutputStore(db)
    expect(() => new ToolOutputStore(db)).not.toThrow()
  })

  it('marker format is tool-output://<hash>', () => {
    expect(toolOutputMarker('abc123')).toBe('tool-output://abc123')
  })
})
