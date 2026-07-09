/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_1bd399099702 AC coverage: DoD check #13 — knowledge_store_entry
 *
 * AC: agf check <id> includes check #13 (recommended): knowledge store has >=1 entry with sourceId containing nodeId
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { hasKnowledgeEntry } from '../core/knowledge/knowledge-check.js'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE knowledge_documents (
      id            TEXT PRIMARY KEY,
      source_type   TEXT NOT NULL,
      source_id     TEXT NOT NULL,
      title         TEXT NOT NULL,
      content       TEXT NOT NULL,
      content_hash  TEXT NOT NULL,
      chunk_index   INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );
  `)
  return db
}

function insertDoc(db: Database.Database, sourceId: string) {
  db.prepare(
    `INSERT INTO knowledge_documents (id, source_type, source_id, title, content, content_hash, created_at, updated_at)
     VALUES (?, 'task', ?, 'Title', 'Content', 'hash', datetime('now'), datetime('now'))`,
  ).run(`doc_${Math.random()}`, sourceId)
}

describe('hasKnowledgeEntry', () => {
  it('returns false when no knowledge documents exist', () => {
    const db = makeDb()
    expect(hasKnowledgeEntry(db, 'node_abc123')).toBe(false)
  })

  it('returns true when source_id contains nodeId exactly', () => {
    const db = makeDb()
    insertDoc(db, 'node_abc123')
    expect(hasKnowledgeEntry(db, 'node_abc123')).toBe(true)
  })

  it('returns true when source_id contains nodeId as substring', () => {
    const db = makeDb()
    insertDoc(db, 'task/node_abc123/context')
    expect(hasKnowledgeEntry(db, 'node_abc123')).toBe(true)
  })

  it('returns false when source_id does not contain nodeId', () => {
    const db = makeDb()
    insertDoc(db, 'node_xyz789')
    expect(hasKnowledgeEntry(db, 'node_abc123')).toBe(false)
  })

  it('returns false when knowledge_documents table does not exist (graceful)', () => {
    const db = new Database(':memory:')
    expect(hasKnowledgeEntry(db, 'node_abc123')).toBe(false)
  })
})
