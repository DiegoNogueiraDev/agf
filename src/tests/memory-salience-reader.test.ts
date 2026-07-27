/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, utimes, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { rankMemoriesByActivation, searchMemories } from '../core/memory/memory-reader.js'

const NOW = 10 * 365 * 24 * 60 * 60 * 1000 // fixed clock (10y), avoids real-time flake
const DAY = 24 * 60 * 60 * 1000

let base: string

async function writeMem(name: string, content: string, ageMs: number): Promise<void> {
  const file = path.join(base, 'workflow-graph', 'memories', `${name}.md`)
  await writeFile(file, content, 'utf-8')
  const when = new Date(NOW - ageMs)
  await utimes(file, when, when)
}

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'agf-mem-'))
  await mkdir(path.join(base, 'workflow-graph', 'memories'), { recursive: true })
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

describe('rankMemoriesByActivation (ACT-R wiring over the filesystem)', () => {
  it('a recent crucial memory outranks an old repetitive one', async () => {
    await writeMem('recent', 'auth uses JWT rotation with refresh', DAY)
    await writeMem('stale', 'auth auth auth auth auth legacy notes', 400 * DAY)

    const out = await rankMemoriesByActivation(base, 'auth', { limit: 5, nowMs: NOW, threshold: -Infinity })
    expect(out.kept[0]?.name).toBe('recent')
  })

  it('drops stale/rare memories below the relative activation band and reports saved tokens', async () => {
    await writeMem('recent', 'auth uses JWT rotation', DAY)
    await writeMem('stale', 'auth (one old mention)', 400 * DAY)

    const out = await rankMemoriesByActivation(base, 'auth', { limit: 5, nowMs: NOW, relativeThreshold: 2.5 })
    expect(out.kept.map((k) => k.name)).toEqual(['recent'])
    expect(out.droppedTokens).toBeGreaterThan(0)
  })

  it('never returns more than the limit', async () => {
    for (let i = 0; i < 8; i++) await writeMem(`m${i}`, 'auth token note', (i + 1) * DAY)
    const out = await rankMemoriesByActivation(base, 'auth', { limit: 3, nowMs: NOW, threshold: -Infinity })
    expect(out.kept.length).toBeLessThanOrEqual(3)
  })

  it('parity guard: searchMemories still ranks by raw occurrence count (byte-identical path)', async () => {
    await writeMem('recent', 'auth uses JWT rotation', DAY)
    await writeMem('stale', 'auth auth auth auth auth', 400 * DAY)

    // Legacy path: more occurrences wins regardless of recency.
    const legacy = await searchMemories(base, 'auth', 5)
    expect(legacy[0]?.name).toBe('stale')
  })
})
