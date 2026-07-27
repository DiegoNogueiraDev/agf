/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/knowledge/knowledge-check.ts — hasKnowledgeEntry.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { hasKnowledgeEntry } from '../core/knowledge/knowledge-check.js'

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE knowledge_documents (source_id TEXT)')
  return db
}

describe('hasKnowledgeEntry', () => {
  it('returns false when the knowledge_documents table is absent (error-safe)', () => {
    const db = new Database(':memory:')
    expect(hasKnowledgeEntry(db, 'node_abc')).toBe(false)
  })

  it('returns true when a source_id contains the node id', () => {
    const db = freshDb()
    db.prepare('INSERT INTO knowledge_documents (source_id) VALUES (?)').run('node_abc:chunk-1')
    expect(hasKnowledgeEntry(db, 'node_abc')).toBe(true)
  })

  it('returns false when no source_id matches the node id', () => {
    const db = freshDb()
    db.prepare('INSERT INTO knowledge_documents (source_id) VALUES (?)').run('node_other:chunk-1')
    expect(hasKnowledgeEntry(db, 'node_abc')).toBe(false)
  })
})
