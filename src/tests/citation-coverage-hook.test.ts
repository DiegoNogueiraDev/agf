/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { runCitationCoverageCheck } from '../core/hooks/citation-coverage-hook.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function makeStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('citation-coverage-hook-test')
  return store
}

function addNode(store: SqliteStore, overrides: Partial<GraphNode> & { id: string }): void {
  const now = new Date().toISOString()
  store.insertNode({
    type: 'task',
    title: overrides.id,
    status: 'done',
    priority: 2,
    acceptanceCriteria: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as GraphNode)
}

describe('runCitationCoverageCheck', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-citation-hook-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns undefined when the node has no implementationFiles', () => {
    const store = makeStore()
    addNode(store, { id: 'node_no_files' })
    expect(runCitationCoverageCheck(store, 'node_no_files', dir)).toBeUndefined()
    store.close()
  })

  it('returns undefined when the node does not exist', () => {
    const store = makeStore()
    expect(runCitationCoverageCheck(store, 'node_missing', dir)).toBeUndefined()
    store.close()
  })

  it('reports src/core files missing a §CITATION, reading content from disk', () => {
    const store = makeStore()
    mkdirSync(join(dir, 'src/core'), { recursive: true })
    writeFileSync(join(dir, 'src/core/no-citation.ts'), 'export const x = 1')
    writeFileSync(join(dir, 'src/core/has-citation.ts'), '// §EPIC-1 — has one\nexport const y = 2')
    addNode(store, {
      id: 'node_files',
      implementationFiles: ['src/core/no-citation.ts', 'src/core/has-citation.ts'],
    })
    const report = runCitationCoverageCheck(store, 'node_files', dir)
    expect(report).toBeDefined()
    expect(report!.missing).toEqual(['src/core/no-citation.ts'])
    expect(report!.scanned).toBe(2)
    store.close()
  })

  it('is opt-out via MCP_GRAPH_CITATION_GUARD=off', () => {
    const store = makeStore()
    mkdirSync(join(dir, 'src/core'), { recursive: true })
    writeFileSync(join(dir, 'src/core/no-citation.ts'), 'export const x = 1')
    addNode(store, { id: 'node_disabled', implementationFiles: ['src/core/no-citation.ts'] })
    const report = runCitationCoverageCheck(store, 'node_disabled', dir, { MCP_GRAPH_CITATION_GUARD: 'off' })
    expect(report).toBeUndefined()
    store.close()
  })

  it('skips implementation files that are missing from disk instead of throwing', () => {
    const store = makeStore()
    addNode(store, { id: 'node_ghost', implementationFiles: ['src/core/does-not-exist.ts'] })
    const report = runCitationCoverageCheck(store, 'node_ghost', dir)
    expect(report).toBeDefined()
    expect(report!.scanned).toBe(0)
    expect(report!.missing).toEqual([])
    store.close()
  })
})
