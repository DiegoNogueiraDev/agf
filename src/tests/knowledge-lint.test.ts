/*!
 * Task node_9f4f319b96c3 — lintKnowledge(db): pure read, no deletions.
 *
 * AC1: Given db :memory: with 3 valid docs, When lintKnowledge(db) runs,
 *      Then result.scanned===3 and result.deleted===0.
 * AC2: Given any db, When lintKnowledge runs, Then no rows removed (count before === after).
 * AC3: Given knowledge_documents table absent, When runs, Then returns {findings:[],scanned:0,deleted:0}.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { lintKnowledge } from '../core/knowledge/knowledge-lint.js'

function makeDb(withTable = true) {
  const db = new Database(':memory:')
  if (withTable) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        source TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_accessed_at TEXT
      )
    `)
  }
  return db
}

describe('lintKnowledge', () => {
  it('scans 3 valid docs and deletes 0 (AC1)', () => {
    const db = makeDb()
    const now = new Date().toISOString()
    db.prepare('INSERT INTO knowledge_documents (id, content, created_at) VALUES (?, ?, ?)').run(
      'd1',
      'content one valid',
      now,
    )
    db.prepare('INSERT INTO knowledge_documents (id, content, created_at) VALUES (?, ?, ?)').run(
      'd2',
      'content two valid',
      now,
    )
    db.prepare('INSERT INTO knowledge_documents (id, content, created_at) VALUES (?, ?, ?)').run(
      'd3',
      'content three valid',
      now,
    )

    const result = lintKnowledge(db)
    expect(result.scanned).toBe(3)
    expect(result.deleted).toBe(0)
  })

  it('does not remove any rows (AC2)', () => {
    const db = makeDb()
    const now = new Date().toISOString()
    db.prepare('INSERT INTO knowledge_documents (id, content, created_at) VALUES (?, ?, ?)').run(
      'x1',
      'some content here',
      now,
    )
    const before = (db.prepare('SELECT COUNT(*) as n FROM knowledge_documents').get() as { n: number }).n

    lintKnowledge(db)

    const after = (db.prepare('SELECT COUNT(*) as n FROM knowledge_documents').get() as { n: number }).n
    expect(after).toBe(before)
  })

  it('returns empty result when table absent (AC3)', () => {
    const db = makeDb(false)
    const result = lintKnowledge(db)
    expect(result.findings).toEqual([])
    expect(result.scanned).toBe(0)
    expect(result.deleted).toBe(0)
  })
})
