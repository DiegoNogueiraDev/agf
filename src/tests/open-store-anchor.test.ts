/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_78929e373432 — guard --dir with a double anchor (package.json/.git).
 * The bug: `cd outro-repo && agf node add` wrote to the WRONG graph when the
 * other repo also happened to have a workflow-graph/graph.db (e.g. from a
 * stray/legacy import) but no project anchor of its own. requireExisting only
 * checked that graph.db exists — not that the dir is genuinely this project's
 * root. AGF_ALLOW_NO_ANCHOR=1 opts back in for legitimate anchor-less setups.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { openStoreOrFail } from '../cli/open-store.js'
import { StoreNotFoundError } from '../core/store/store-not-found-error.js'

function makeDirWithGraph(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agf-anchor-'))
  const store = SqliteStore.open(dir)
  store.initProject('anchor-test')
  store.close()
  return dir
}

describe('openStoreOrFail — --dir double anchor guard (package.json/.git)', () => {
  const dirs: string[] = []

  // The global vitest-setup-node.ts sets AGF_ALLOW_NO_ANCHOR=1 for the rest
  // of the suite (tests routinely use anchor-less tmpdirs legitimately) —
  // this file specifically tests the unset/rejecting behavior, so start
  // each test from a clean, unset state.
  beforeEach(() => {
    delete process.env.AGF_ALLOW_NO_ANCHOR
  })

  afterEach(() => {
    delete process.env.AGF_ALLOW_NO_ANCHOR
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  it('GIVEN dir with graph.db + package.json THEN the store opens normally', () => {
    const dir = makeDirWithGraph()
    dirs.push(dir)
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x' }))

    const store = openStoreOrFail(dir, { requireExisting: true })
    expect(store).toBeDefined()
    store.close()
  })

  it('GIVEN dir with graph.db + .git (no package.json) THEN the store opens normally', () => {
    const dir = makeDirWithGraph()
    dirs.push(dir)
    mkdirSync(join(dir, '.git'))

    const store = openStoreOrFail(dir, { requireExisting: true })
    expect(store).toBeDefined()
    store.close()
  })

  it("GIVEN dir with graph.db but NO package.json and NO .git THEN throws StoreNotFoundError mentioning 'no project anchor' and AGF_ALLOW_NO_ANCHOR", () => {
    const dir = makeDirWithGraph()
    dirs.push(dir)

    expect(() => openStoreOrFail(dir, { requireExisting: true })).toThrow(StoreNotFoundError)
    try {
      openStoreOrFail(dir, { requireExisting: true })
    } catch (err) {
      expect((err as Error).message).toContain('no project anchor')
      expect((err as Error).message).toContain('AGF_ALLOW_NO_ANCHOR')
    }
  })

  it('GIVEN dir with graph.db, no anchor, and AGF_ALLOW_NO_ANCHOR=1 THEN the store opens (explicit override)', () => {
    const dir = makeDirWithGraph()
    dirs.push(dir)
    process.env.AGF_ALLOW_NO_ANCHOR = '1'

    const store = openStoreOrFail(dir, { requireExisting: true })
    expect(store).toBeDefined()
    store.close()
  })
})
