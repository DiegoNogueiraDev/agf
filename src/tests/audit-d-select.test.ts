/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * AUDIT-026 — wildcard / array select syntax (`data.*.id`, `data[].id`, `data[N]`)
 * was unimplemented: projectPath fell through and returned the FULL envelope, so
 * every built-in profile's `query` preset (which uses `data.*.id`) silently
 * disabled the advertised token savings.
 */

import { describe, it, expect } from 'vitest'
import { projectEnvelope } from '../core/output/select.js'
import type { OutputEnvelope } from '../core/output/envelope.js'

function arrEnv<T>(data: T): OutputEnvelope<T> {
  return { ok: true, data, meta: { command: 'query', ms: 1 } }
}

const rows = [
  { id: 'n1', title: 'Alpha', status: 'backlog', type: 'task', description: 'long...' },
  { id: 'n2', title: 'Beta', status: 'done', type: 'epic', description: 'longer...' },
]

describe('projectEnvelope — wildcard / array fan-out (AUDIT-026)', () => {
  it('expands `data.*.id` over a top-level array', () => {
    const out = projectEnvelope(arrEnv(rows), ['data.*.id'])
    expect(out.data).toEqual([{ id: 'n1' }, { id: 'n2' }])
  })

  it('expands `data[].id` (bracket form) identically to `data.*.id`', () => {
    const out = projectEnvelope(arrEnv(rows), ['data[].id'])
    expect(out.data).toEqual([{ id: 'n1' }, { id: 'n2' }])
  })

  it('merges several wildcard paths into per-element objects', () => {
    const out = projectEnvelope(arrEnv(rows), ['data.*.id', 'data.*.title', 'data.*.status'])
    expect(out.data).toEqual([
      { id: 'n1', title: 'Alpha', status: 'backlog' },
      { id: 'n2', title: 'Beta', status: 'done' },
    ])
  })

  it('does not leak the unselected fields (real token savings)', () => {
    const out = projectEnvelope(arrEnv(rows), ['data.*.id'])
    const data = out.data as Array<Record<string, unknown>>
    expect(data[0]).not.toHaveProperty('description')
    expect(data[0]).not.toHaveProperty('title')
  })

  it('supports a positive index `data[1].id`', () => {
    const out = projectEnvelope(arrEnv(rows), ['data[1].id'])
    expect(out.data).toEqual({ id: 'n2' })
  })

  it('supports `data.*` (no trailing key) → the full array', () => {
    const out = projectEnvelope(arrEnv(rows), ['data.*'])
    expect(out.data).toEqual(rows)
  })

  it('falls back to the full envelope when the index is out of range', () => {
    const e = arrEnv(rows)
    expect(projectEnvelope(e, ['data[9].id'])).toEqual(e)
  })

  it('falls back to the full envelope when `*` is used on a non-array', () => {
    const e: OutputEnvelope = { ok: true, data: { node: { id: 'x' } }, meta: { command: 'query', ms: 1 } }
    expect(projectEnvelope(e, ['data.*.id'])).toEqual(e)
  })

  it('still auto-fans-out a named array key (`data.nodes.id`) — backward compat', () => {
    const e = arrEnv({ nodes: rows })
    const out = projectEnvelope(e, ['data.nodes.id'])
    expect(out.data).toEqual({ nodes: [{ id: 'n1' }, { id: 'n2' }] })
  })

  it('retains the envelope invariants (ok/meta) on a wildcard projection', () => {
    const out = projectEnvelope(arrEnv(rows), ['data.*.id'])
    expect(out.ok).toBe(true)
    expect(out.meta).toEqual({ command: 'query', ms: 1 })
  })
})
