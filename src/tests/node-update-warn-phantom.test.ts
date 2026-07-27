/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_df3bb0abfd18 — warn (not block) phantom file-ref on agf node update.
 * PHANTOM_TESTFILE only catches ghost files at `agf done` — between node
 * add/update and done, a node can carry nonexistent testFiles/
 * implementationFiles with nobody noticing. Reuses missingFiles
 * (detect-phantom-done.ts) + makeFileExists (file-exists-port.ts) — the same
 * functions the done gate uses.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { nodeCommand } from '../cli/commands/node-cmd.js'
import { getLogBuffer, clearLogBuffer } from '../core/utils/logger.js'
import type { GraphNode } from '../core/graph/graph-types.js'

describe('agf node update — warns on phantom file-ref (not block)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-node-update-warn-'))
    const store = SqliteStore.open(dir)
    store.initProject('node-update-warn-test')
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
    clearLogBuffer()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    clearLogBuffer()
  })

  it("GIVEN --test-files ghost.ts (does not exist) THEN log.warn fires with nodeId + missing=['ghost.ts'], and the node is still updated", async () => {
    await nodeCommand().parseAsync(['update', 'node_target', '--test-files', 'ghost.ts', '-d', dir], {
      from: 'user',
    })

    const warnings = getLogBuffer().filter((e) => e.level === 'warn')
    expect(warnings.length).toBeGreaterThan(0)
    const entry = warnings.find((w) => JSON.stringify(w.context).includes('ghost.ts'))
    expect(entry).toBeDefined()
    expect(entry?.context?.nodeId).toBe('node_target')
    expect(entry?.context?.missing).toEqual(['ghost.ts'])
    expect(entry?.context?.service).toBe('node-cmd.ts')

    const store = SqliteStore.open(dir)
    const node = store.getNodeById('node_target')
    store.close()
    expect(node?.testFiles).toEqual(['ghost.ts'])
  })

  it('GIVEN --test-files real.ts (exists on disk) THEN no warning is logged and the node is updated', async () => {
    writeFileSync(join(dir, 'real.ts'), '// real file\n')

    await nodeCommand().parseAsync(['update', 'node_target', '--test-files', 'real.ts', '-d', dir], {
      from: 'user',
    })

    const warnings = getLogBuffer().filter((e) => e.level === 'warn')
    expect(warnings).toHaveLength(0)

    const store = SqliteStore.open(dir)
    const node = store.getNodeById('node_target')
    store.close()
    expect(node?.testFiles).toEqual(['real.ts'])
  })

  it('GIVEN --test-files ghost.ts --implementation-files also-ghost.ts THEN the warning lists BOTH missing files', async () => {
    await nodeCommand().parseAsync(
      ['update', 'node_target', '--test-files', 'ghost.ts', '--implementation-files', 'also-ghost.ts', '-d', dir],
      { from: 'user' },
    )

    const warnings = getLogBuffer().filter((e) => e.level === 'warn')
    const entry = warnings.find((w) => JSON.stringify(w.context).includes('ghost.ts'))
    expect(entry).toBeDefined()
    expect(entry?.context?.missing).toEqual(expect.arrayContaining(['ghost.ts', 'also-ghost.ts']))
  })
})
