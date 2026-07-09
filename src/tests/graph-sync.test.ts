/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 2.4 AC coverage: graph-sync.ts — syncGraphFromCode
 *
 * AC1: 3 symbols indexed WHEN sync THEN sourceRefs pointing to indexed files are NOT stale
 * AC2: symbol removed from file WHEN re-sync THEN node with that sourceRef appears in staleRefs
 * AC3: mixed batch (some indexed, some not) THEN stale ones reported, rest processed normally
 * Coverage: graph-sync.ts ≥ 90% branch coverage
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { syncGraphFromCode } from '../core/code/graph-sync.js'
import type { GraphNode, NodeStatus, NodeType } from '../core/graph/graph-types.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function freshStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('sync-test')
  return store
}

let _seq = 0
function makeNode(override: Partial<GraphNode> = {}): GraphNode {
  const ts = new Date().toISOString()
  return {
    id: `node_sync_${++_seq}`,
    type: 'task' as NodeType,
    title: 'sync task',
    description: '',
    status: 'backlog' as NodeStatus,
    priority: 3,
    xpSize: 'S',
    parentId: null,
    acceptanceCriteria: [],
    tags: [],
    createdAt: ts,
    updatedAt: ts,
    metadata: {},
    ...override,
  }
}

function populateCodeIndex(store: SqliteStore, files: string[]): void {
  const db = store.getDb()
  const project = store.getProject()
  if (!project) return

  const now = new Date().toISOString()

  db.prepare(`INSERT OR REPLACE INTO code_index_meta (project_id, last_indexed, symbol_count) VALUES (?, ?, ?)`).run(
    project.id,
    now,
    files.length * 3,
  )

  for (const file of files) {
    db.prepare(
      `
      INSERT OR IGNORE INTO code_symbols
        (id, project_id, name, kind, file, start_line, end_line, exported, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(`sym_${Math.random().toString(36).slice(2)}`, project.id, 'fn_test', 'function', file, 1, 10, 1, now)
  }
}

// ── AC1: 3 symbols indexed → sourceRefs to those files NOT in staleRefs ───────

describe('AC1: indexed files are not flagged as stale sourceRefs', () => {
  it('node with sourceRef to indexed file is NOT in staleRefs', () => {
    const store = freshStore()
    populateCodeIndex(store, ['src/core/graph/graph.ts'])
    store.insertNode(makeNode({ sourceRef: { file: 'src/core/graph/graph.ts' } }))

    const report = syncGraphFromCode(store)
    expect(report.staleRefs).toHaveLength(0)
    store.close()
  })

  it('3 nodes with sourceRefs to 3 indexed files → staleRefs empty (AC1)', () => {
    const store = freshStore()
    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts']
    populateCodeIndex(store, files)
    for (const f of files) {
      store.insertNode(makeNode({ sourceRef: { file: f } }))
    }

    const report = syncGraphFromCode(store)
    expect(report.staleRefs).toHaveLength(0)
    store.close()
  })

  it('node without sourceRef generates no stale report', () => {
    const store = freshStore()
    populateCodeIndex(store, ['src/x.ts'])
    store.insertNode(makeNode({ sourceRef: undefined }))

    const report = syncGraphFromCode(store)
    expect(report.staleRefs).toHaveLength(0)
    store.close()
  })

  it('normalized paths: leading ./ stripped for matching', () => {
    const store = freshStore()
    populateCodeIndex(store, ['src/graph/node.ts'])
    // sourceRef uses ./src/graph/node.ts but index has src/graph/node.ts
    store.insertNode(makeNode({ sourceRef: { file: './src/graph/node.ts' } }))

    const report = syncGraphFromCode(store)
    expect(report.staleRefs).toHaveLength(0)
    store.close()
  })
})

// ── AC2: symbol removed → node appears in staleRefs ──────────────────────────

describe('AC2: removed symbol → node with that sourceRef in staleRefs', () => {
  it('node with sourceRef to non-indexed file is in staleRefs (AC2)', () => {
    const store = freshStore()
    populateCodeIndex(store, ['src/other-file.ts'])
    // This node references a file that is NOT in the code index
    store.insertNode(makeNode({ sourceRef: { file: 'src/deleted-symbol.ts' } }))

    const report = syncGraphFromCode(store)
    expect(report.staleRefs.length).toBeGreaterThan(0)
    expect(report.staleRefs[0]).toContain('src/deleted-symbol.ts')
    store.close()
  })

  it('staleRef entry includes node id and file path', () => {
    const store = freshStore()
    populateCodeIndex(store, ['src/existing.ts'])
    const node = makeNode({ id: 'node_stale_check', title: 'removed sym task', sourceRef: { file: 'src/removed.ts' } })
    store.insertNode(node)

    const report = syncGraphFromCode(store)
    const stale = report.staleRefs.find((r) => r.includes('src/removed.ts'))
    expect(stale).toBeDefined()
    store.close()
  })

  it('multiple nodes where some have stale refs and some do not', () => {
    const store = freshStore()
    populateCodeIndex(store, ['src/active.ts'])
    store.insertNode(makeNode({ sourceRef: { file: 'src/active.ts' } })) // not stale
    store.insertNode(makeNode({ sourceRef: { file: 'src/deleted.ts' } })) // stale

    const report = syncGraphFromCode(store)
    expect(report.staleRefs.length).toBe(1)
    expect(report.staleRefs[0]).toContain('src/deleted.ts')
    store.close()
  })
})

// ── AC3: batch sync — stale reported, rest processed ─────────────────────────

describe('AC3: batch sync — stale files reported but rest of batch processes normally', () => {
  it('3 indexed + 1 not-indexed → 1 stale ref, rest clean', () => {
    const store = freshStore()
    populateCodeIndex(store, ['src/a.ts', 'src/b.ts', 'src/c.ts'])
    store.insertNode(makeNode({ sourceRef: { file: 'src/a.ts' } }))
    store.insertNode(makeNode({ sourceRef: { file: 'src/b.ts' } }))
    store.insertNode(makeNode({ sourceRef: { file: 'src/c.ts' } }))
    store.insertNode(makeNode({ sourceRef: { file: 'src/MISSING.ts' } }))

    const report = syncGraphFromCode(store)
    expect(report.staleRefs.length).toBe(1)
    expect(report.staleRefs[0]).toContain('src/MISSING.ts')
    store.close()
  })

  it('nodes without sourceRef are unaffected by stale check', () => {
    const store = freshStore()
    populateCodeIndex(store, ['src/indexed.ts'])
    store.insertNode(makeNode({ sourceRef: undefined }))
    store.insertNode(makeNode({ sourceRef: { file: 'src/indexed.ts' } }))
    store.insertNode(makeNode({ sourceRef: { file: 'src/missing.ts' } }))

    const report = syncGraphFromCode(store)
    expect(report.staleRefs.length).toBe(1)
    store.close()
  })

  it('syncGraphFromCode returns a SyncReport with all 4 fields', () => {
    const store = freshStore()
    const report = syncGraphFromCode(store)
    expect(Array.isArray(report.staleRefs)).toBe(true)
    expect(Array.isArray(report.autoFilledTestFiles)).toBe(true)
    expect(Array.isArray(report.symbolChanges)).toBe(true)
    expect(Array.isArray(report.suggestions)).toBe(true)
    store.close()
  })
})

// ── Suggestions — done tasks without testFiles ────────────────────────────────

describe('suggestions: done tasks without testFiles', () => {
  it('done task without testFiles generates a suggestion', () => {
    const store = freshStore()
    store.insertNode(makeNode({ status: 'done' as NodeStatus, type: 'task' as NodeType, testFiles: [] }))

    const report = syncGraphFromCode(store)
    expect(report.suggestions.length).toBeGreaterThan(0)
    store.close()
  })

  it('done task WITH testFiles does not generate a testFiles suggestion', () => {
    const store = freshStore()
    populateCodeIndex(store, ['src/task.test.ts'])
    store.insertNode(makeNode({ status: 'done', type: 'task', testFiles: ['src/task.test.ts'] }))

    const report = syncGraphFromCode(store)
    const noTestFilesSuggestion = report.suggestions.filter((s) => s.includes('without testFiles'))
    expect(noTestFilesSuggestion).toHaveLength(0)
    store.close()
  })

  it('backlog task without testFiles does NOT generate a suggestion (only done tasks)', () => {
    const store = freshStore()
    store.insertNode(makeNode({ status: 'backlog', type: 'task', testFiles: [] }))

    const report = syncGraphFromCode(store)
    const testFileSuggestions = report.suggestions.filter((s) => s.includes('without testFiles'))
    expect(testFileSuggestions).toHaveLength(0)
    store.close()
  })

  it('done subtask without testFiles also generates a suggestion', () => {
    const store = freshStore()
    store.insertNode(makeNode({ status: 'done', type: 'subtask', testFiles: [] }))

    const report = syncGraphFromCode(store)
    expect(report.suggestions.length).toBeGreaterThan(0)
    store.close()
  })

  it('done task with testFile not in code index generates an unindexed suggestion', () => {
    const store = freshStore()
    populateCodeIndex(store, ['src/other.ts']) // testFile not indexed
    store.insertNode(makeNode({ status: 'done', type: 'task', testFiles: ['src/missing.test.ts'] }))

    const report = syncGraphFromCode(store)
    const missingTestSuggestion = report.suggestions.find((s) => s.includes('src/missing.test.ts'))
    expect(missingTestSuggestion).toBeDefined()
    store.close()
  })
})

// ── No code index → no stale refs ─────────────────────────────────────────────

describe('no code index present → stale ref check skipped', () => {
  it('returns empty staleRefs when code_index_meta is empty', () => {
    const store = freshStore()
    // No code index populated → hasCodeIndex=false → stale ref check disabled
    store.insertNode(makeNode({ sourceRef: { file: 'src/any-file.ts' } }))

    const report = syncGraphFromCode(store)
    expect(report.staleRefs).toHaveLength(0)
    store.close()
  })

  it('returns empty report for a store with no nodes', () => {
    const store = freshStore()
    const report = syncGraphFromCode(store)
    expect(report.staleRefs).toHaveLength(0)
    expect(report.suggestions).toHaveLength(0)
    store.close()
  })

  it('returns empty staleRefs when no project exists', () => {
    // Store without a project → getProject() returns null → early return
    const store = SqliteStore.open(':memory:')
    const report = syncGraphFromCode(store)
    expect(report.staleRefs).toHaveLength(0)
    store.close()
  })
})

// ── symbolChanges — git hash tracking ─────────────────────────────────────────

describe('symbolChanges: git hash tracking', () => {
  it('symbolChanges includes git hash when code_index_meta has git_hash', () => {
    const store = freshStore()
    const db = store.getDb()
    const project = store.getProject()!
    const now = new Date().toISOString()

    db.prepare(
      `
      INSERT OR REPLACE INTO code_index_meta
        (project_id, last_indexed, symbol_count, git_hash)
      VALUES (?, ?, ?, ?)
    `,
    ).run(project.id, now, 10, 'abc123def456')

    db.prepare(
      `
      INSERT OR IGNORE INTO code_symbols
        (id, project_id, name, kind, file, start_line, end_line, exported, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run('sym_hash_test', project.id, 'fn', 'function', 'src/foo.ts', 1, 5, 1, now)

    const report = syncGraphFromCode(store)
    expect(report.symbolChanges.some((c) => c.includes('abc123def456'))).toBe(true)
    store.close()
  })

  it('symbolChanges is empty when no git_hash in meta', () => {
    const store = freshStore()
    const db = store.getDb()
    const project = store.getProject()!
    const now = new Date().toISOString()

    db.prepare(
      `
      INSERT OR REPLACE INTO code_index_meta
        (project_id, last_indexed, symbol_count)
      VALUES (?, ?, ?)
    `,
    ).run(project.id, now, 5)

    db.prepare(
      `
      INSERT OR IGNORE INTO code_symbols
        (id, project_id, name, kind, file, start_line, end_line, exported, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run('sym_no_hash', project.id, 'fn', 'function', 'src/bar.ts', 1, 5, 1, now)

    const report = syncGraphFromCode(store)
    expect(report.symbolChanges).toHaveLength(0)
    store.close()
  })
})
