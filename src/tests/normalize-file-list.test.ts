/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_ff153b8b5730 — split-comma in --test-files/--implementation-files.
 * The bug: `--test-files 'a,b'` was silently parsed as ONE file named 'a,b',
 * causing false PHANTOM_TESTFILE gaps. normalizeTags already split-on-comma +
 * trim + dedup for tags; node-cmd.ts's testFiles/implementationFiles options
 * passed raw values without it. normalizeList is the shared generic the two
 * domains (tags, file paths) both delegate to (DRY, no parallel logic).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeList } from '../core/utils/normalize-list.js'
import { normalizeTags } from '../core/graph/normalize-tags.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { nodeCommand } from '../cli/commands/node-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

describe('normalizeList', () => {
  it("GIVEN a single comma-joined entry 'a.ts,b.ts' THEN returns 2 entries, not 1", () => {
    expect(normalizeList(['a.ts,b.ts'])).toEqual(['a.ts', 'b.ts'])
  })

  it('GIVEN variadic separate entries THEN still works (no comma needed)', () => {
    expect(normalizeList(['a.ts', 'b.ts'])).toEqual(['a.ts', 'b.ts'])
  })

  it("GIVEN comma-joined entries with surrounding whitespace 'src/x.ts, src/y.ts' THEN trims each piece", () => {
    expect(normalizeList(['src/x.ts, src/y.ts'])).toEqual(['src/x.ts', 'src/y.ts'])
  })

  it('GIVEN duplicate entries THEN dedupes, preserving first-seen order', () => {
    expect(normalizeList(['a.ts,b.ts,a.ts'])).toEqual(['a.ts', 'b.ts'])
  })

  it('GIVEN undefined THEN returns an empty array', () => {
    expect(normalizeList(undefined)).toEqual([])
  })

  it('GIVEN blank/empty pieces THEN drops them', () => {
    expect(normalizeList(['a.ts,,b.ts', ''])).toEqual(['a.ts', 'b.ts'])
  })
})

describe('normalizeTags — delegates to normalizeList (regression: still works after extraction)', () => {
  it('splits comma-joined tags and dedupes', () => {
    expect(normalizeTags(['x,y,x'])).toEqual(['x', 'y'])
  })

  it('returns [] for undefined', () => {
    expect(normalizeTags(undefined)).toEqual([])
  })
})

describe('agf node update --test-files/--implementation-files — end-to-end split-comma fix', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-node-update-files-'))
    const store = SqliteStore.open(dir)
    store.initProject('node-update-files-test')
    const now = new Date().toISOString()
    store.insertNode({
      id: 'node_target',
      type: 'task',
      title: 'target',
      status: 'backlog',
      priority: 2,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    store.close()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("GIVEN --test-files 'a.ts,b.ts' THEN node.testFiles has 2 entries, not 1", async () => {
    await nodeCommand().parseAsync(['update', 'node_target', '--test-files', 'a.ts,b.ts', '-d', dir], {
      from: 'user',
    })
    const store = SqliteStore.open(dir)
    const node = store.getNodeById('node_target')
    store.close()
    expect(node?.testFiles).toEqual(['a.ts', 'b.ts'])
  })

  it('GIVEN variadic --test-files a.ts b.ts THEN still works', async () => {
    await nodeCommand().parseAsync(['update', 'node_target', '--test-files', 'a.ts', 'b.ts', '-d', dir], {
      from: 'user',
    })
    const store = SqliteStore.open(dir)
    const node = store.getNodeById('node_target')
    store.close()
    expect(node?.testFiles).toEqual(['a.ts', 'b.ts'])
  })

  it("GIVEN --implementation-files 'src/x.ts, src/y.ts' THEN splits and trims", async () => {
    await nodeCommand().parseAsync(
      ['update', 'node_target', '--implementation-files', 'src/x.ts, src/y.ts', '-d', dir],
      { from: 'user' },
    )
    const store = SqliteStore.open(dir)
    const node = store.getNodeById('node_target')
    store.close()
    expect(node?.implementationFiles).toEqual(['src/x.ts', 'src/y.ts'])
  })
})
