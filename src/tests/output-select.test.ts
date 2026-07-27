/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for --select field projection on the JSON output envelope.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { projectEnvelope } from '../core/output/select.js'
import { writeEnvelope, setSelect, setPretty } from '../core/output/writer.js'
import type { OutputEnvelope } from '../core/output/envelope.js'

const baseMeta = { command: 'next', ms: 3 }

function env<T>(data: T): OutputEnvelope<T> {
  return { ok: true, data, meta: { ...baseMeta } }
}

describe('projectEnvelope', () => {
  it('keeps only a nested path and retains invariant fields', () => {
    const e = env({ node: { id: 'n1', title: 'T', description: 'long...' }, reason: 'x' })
    const out = projectEnvelope(e, ['data.node.id'])
    expect(out).toEqual({ ok: true, meta: { command: 'next', ms: 3 }, data: { node: { id: 'n1' } } })
  })

  it('merges multiple paths under the same object', () => {
    const e = env({ node: { id: 'n1', title: 'T', description: 'long...' } })
    const out = projectEnvelope(e, ['data.node.id', 'data.node.title'])
    expect(out.data).toEqual({ node: { id: 'n1', title: 'T' } })
  })

  it('projects a field across every element of an array', () => {
    const e = env({
      items: [
        { id: 1, title: 'a' },
        { id: 2, title: 'b' },
      ],
    })
    const out = projectEnvelope(e, ['data.items.title'])
    expect(out.data).toEqual({ items: [{ title: 'a' }, { title: 'b' }] })
  })

  it('always retains ok, code, error and meta on errors', () => {
    const e: OutputEnvelope = {
      ok: false,
      code: 'NOT_FOUND',
      error: 'missing',
      meta: { ...baseMeta },
      data: { hint: 'x' },
    }
    const out = projectEnvelope(e, ['data.nothing.here'])
    // invalid path -> no projection: full envelope preserved
    expect(out).toEqual(e)
  })

  it('treats an empty path list as a no-op (full envelope)', () => {
    const e = env({ a: 1, b: 2 })
    expect(projectEnvelope(e, [])).toEqual(e)
  })

  it('emits the full envelope when no path resolves (no-op, never errors)', () => {
    const e = env({ a: 1 })
    expect(projectEnvelope(e, ['data.zzz', 'data.q.w'])).toEqual(e)
  })

  it('keeps a whole subtree when the path stops at an object', () => {
    const e = env({ node: { id: 'n1', meta: { x: 1, y: 2 } } })
    const out = projectEnvelope(e, ['data.node.meta'])
    expect(out.data).toEqual({ node: { meta: { x: 1, y: 2 } } })
  })
})

describe('writer --select integration', () => {
  let buf = ''
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((s: string | Uint8Array) => {
    buf += String(s)
    return true
  })

  afterEach(() => {
    buf = ''
    setSelect(null)
    setPretty(false)
    spy.mockClear()
  })

  it('applies the selected projection to written output', () => {
    setSelect(['data.node.id'])
    writeEnvelope(env({ node: { id: 'n1', title: 'T' }, reason: 'r' }))
    const parsed = JSON.parse(buf)
    expect(parsed).toEqual({ ok: true, meta: { command: 'next', ms: 3 }, data: { node: { id: 'n1' } } })
  })

  it('composes with --pretty (indented + projected)', () => {
    setSelect(['data.node.id'])
    setPretty(true)
    writeEnvelope(env({ node: { id: 'n1', title: 'T' } }))
    expect(buf).toContain('\n  ')
    expect(JSON.parse(buf).data).toEqual({ node: { id: 'n1' } })
  })

  it('writes the full envelope when no select is set', () => {
    writeEnvelope(env({ node: { id: 'n1', title: 'T' } }))
    expect(JSON.parse(buf).data).toEqual({ node: { id: 'n1', title: 'T' } })
  })
})
