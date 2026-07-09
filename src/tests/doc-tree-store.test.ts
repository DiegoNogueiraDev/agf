/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_9cceeceb9f61 — doc_tree_nodes persistence (migration v113) + idempotent
 * insert + tree navigation helpers.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { buildDocTree } from '../core/rag/doc-tree.js'
import { insertTreeNodes, countTreeNodes, getTreeChildren } from '../core/rag/doc-tree-store.js'
import type { Section } from '../core/parser/segment.js'

const sec = (level: number, title: string, body: string): Section => ({ level, title, body, startLine: 0, endLine: 0 })

describe('doc-tree-store (#node_9cceeceb9f61)', () => {
  let dir: string
  let store: SqliteStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-doctree-'))
    store = SqliteStore.open(dir) // runs migrations incl. v113
    store.initProject('doctree-test')
  })
  afterEach(() => {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('migration v113 created doc_tree_nodes + fts (count works)', () => {
    expect(countTreeNodes(store.getDb())).toBe(0)
  })

  it('persists a tree and navigates children by parent', () => {
    const tree = buildDocTree([sec(1, 'Auth', 'a'), sec(2, 'Login', 'b'), sec(2, 'Logout', 'c')], 'doc1')
    insertTreeNodes(store.getDb(), 'doc1', tree)
    expect(countTreeNodes(store.getDb())).toBe(3)
    const roots = getTreeChildren(store.getDb(), null)
    expect(roots).toHaveLength(1)
    expect(roots[0].title).toBe('Auth')
    const children = getTreeChildren(store.getDb(), roots[0].id)
    expect(children.map((c) => c.title)).toEqual(['Login', 'Logout'])
  })

  it('re-import is idempotent (replaces the document tree, no duplicates)', () => {
    insertTreeNodes(store.getDb(), 'doc1', buildDocTree([sec(1, 'A', 'x'), sec(2, 'B', 'y')], 'doc1'))
    insertTreeNodes(store.getDb(), 'doc1', buildDocTree([sec(1, 'A', 'x')], 'doc1'))
    expect(countTreeNodes(store.getDb(), 'doc1')).toBe(1)
    const ftsCount = (
      store.getDb().prepare('SELECT COUNT(*) AS c FROM doc_tree_nodes_fts WHERE document_id = ?').get('doc1') as {
        c: number
      }
    ).c
    expect(ftsCount).toBe(1)
  })
})
