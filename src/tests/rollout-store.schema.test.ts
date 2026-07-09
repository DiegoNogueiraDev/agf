/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/schemas/rollout-store.schema.ts — RolloutStore + listSessions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { RolloutStore, listSessions } from '../schemas/rollout-store.schema.js'

let base: string

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'rollout-'))
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

describe('RolloutStore', () => {
  it('appends entries and loads them back in order', async () => {
    const store = new RolloutStore(base)
    await store.append('s1', { kind: 'user', content: 'hi' })
    await store.append('s1', { kind: 'assistant', content: 'yo' })

    const entries = await store.load('s1')
    expect(entries).toHaveLength(2)
    expect(entries[0].kind).toBe('user')
    expect(entries[1].content).toBe('yo')
    expect(entries[0].timestamp).toBeDefined()
  })

  it('load() returns [] for an unknown session', async () => {
    const store = new RolloutStore(base)
    expect(await store.load('missing')).toEqual([])
  })

  it('fork lastN copies only the trailing entries', async () => {
    const store = new RolloutStore(base)
    for (const n of ['a', 'b', 'c']) await store.append('src', { kind: n })
    await store.fork('src', 'dst', 'lastN', 2)

    const forked = await store.load('dst')
    expect(forked.map((e) => e.kind)).toEqual(['b', 'c'])
  })

  it('list and listSessions surface stored session ids', async () => {
    const store = new RolloutStore(base)
    await store.append('alpha', { kind: 'x' })
    expect(await store.list()).toContain('alpha')
    expect(await listSessions(base)).toContain('alpha')
  })

  it('validate flags a corrupt NDJSON line; resume returns null for it', async () => {
    const store = new RolloutStore(base)
    await store.append('good', { kind: 'x' })
    await writeFile(path.join(base, 'rollout-bad.ndjson'), '{"kind":"ok"}\nNOT JSON\n')

    expect((await store.validate('good')).valid).toBe(true)
    const bad = await store.validate('bad')
    expect(bad.valid).toBe(false)
    expect(await store.resume('bad')).toBeNull()
  })
})
