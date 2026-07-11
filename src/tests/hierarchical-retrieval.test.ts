/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_b29a3198c5fb — tree-navigation retrieval: a query matching a deep
 * section returns that section's branch and ranks it above unrelated branches.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { buildDocTree } from '../core/rag/doc-tree.js'
import { insertTreeNodes } from '../core/rag/doc-tree-store.js'
import { hierarchicalTreeSearch } from '../core/rag/hierarchical-retrieval.js'
import type { Section } from '../core/parser/segment.js'

const sec = (level: number, title: string, body: string): Section => ({ level, title, body, startLine: 0, endLine: 0 })

describe('hierarchicalTreeSearch (#node_b29a3198c5fb)', () => {
  let dir: string
  let store: SqliteStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-hsearch-'))
    store = SqliteStore.open(dir)
    store.initProject('hsearch-test')
    const tree = buildDocTree(
      [
        sec(1, 'Authentication', 'how users authenticate'),
        sec(2, 'Password Login', 'the password login validates credentials and issues a session token'),
        sec(2, 'OAuth Login', 'oauth login delegates to an external identity provider'),
        sec(1, 'Billing', 'invoices and payment processing with stripe'),
      ],
      'doc1',
    )
    insertTreeNodes(store.getDb(), 'doc1', tree)
  })
  afterEach(() => {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns the matching section for a deep-section query', () => {
    const hits = hierarchicalTreeSearch(store.getDb(), 'oauth identity provider', 5)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].row.title).toBe('OAuth Login')
  })

  it('ranks the relevant branch above an unrelated branch', () => {
    const hits = hierarchicalTreeSearch(store.getDb(), 'password credentials token', 5)
    const titles = hits.map((h) => h.row.title)
    expect(titles[0]).toBe('Password Login')
    expect(titles).not.toContain('Billing')
  })

  it('returns [] for an empty/stopword-only query', () => {
    expect(hierarchicalTreeSearch(store.getDb(), '   ', 5)).toEqual([])
  })

  it('returns [] when nothing matches', () => {
    expect(hierarchicalTreeSearch(store.getDb(), 'kubernetes helm chart', 5)).toEqual([])
  })
})
