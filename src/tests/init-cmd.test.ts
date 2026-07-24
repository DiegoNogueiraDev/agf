/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { isProjectInitialized } from '../cli/commands/init-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'

describe('isProjectInitialized (node_a0656372d551)', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
    dirs.length = 0
  })

  it('returns false when no graph.db exists at all', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-init-'))
    dirs.push(dir)

    expect(isProjectInitialized(dir)).toBe(false)
  })

  it('returns false when graph.db exists but has no project row — the session:start hook side effect (registerSessionResumeDetector opens the store on every CLI invocation, migrating the schema before init runs, without calling initProject())', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-init-'))
    dirs.push(dir)

    // Simulates the premature store-open: schema migrated, zero project rows.
    const store = SqliteStore.open(dir)
    store.close()

    expect(isProjectInitialized(dir)).toBe(false)
  })

  it('returns true once a project row actually exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-init-'))
    dirs.push(dir)

    const store = SqliteStore.open(dir)
    store.initProject('some-project')
    store.close()

    expect(isProjectInitialized(dir)).toBe(true)
  })
})
