/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/rag/knowledge-feedback.ts — applyFeedback.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { applyFeedback } from '../core/rag/knowledge-feedback.js'

function dbWithDoc(quality: number): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE knowledge_documents (
      id TEXT PRIMARY KEY,
      quality_score REAL,
      staleness_days INTEGER DEFAULT 0,
      usage_count INTEGER DEFAULT 0,
      last_accessed_at INTEGER
    );
    CREATE TABLE knowledge_usage_log (
      doc_id TEXT, query TEXT, action TEXT, context TEXT, created_at INTEGER
    );
  `)
  db.prepare('INSERT INTO knowledge_documents (id, quality_score) VALUES (?, ?)').run('d1', quality)
  return db
}

function quality(db: Database.Database, id: string): number {
  return (db.prepare('SELECT quality_score AS q FROM knowledge_documents WHERE id = ?').get(id) as { q: number }).q
}

describe('applyFeedback', () => {
  it('helpful raises quality (capped at 1.0) and records usage', () => {
    const db = dbWithDoc(0.5)
    applyFeedback(db, 'd1', 'some query', 'helpful')

    expect(quality(db, 'd1')).toBeCloseTo(0.55)
    const usage = db.prepare('SELECT COUNT(*) AS n FROM knowledge_usage_log').get() as { n: number }
    expect(usage.n).toBe(1)
    const doc = db.prepare('SELECT usage_count AS c FROM knowledge_documents WHERE id = ?').get('d1') as { c: number }
    expect(doc.c).toBe(1)
  })

  it('unhelpful lowers quality but floors at 0.1', () => {
    const db = dbWithDoc(0.15)
    applyFeedback(db, 'd1', 'q', 'unhelpful')
    expect(quality(db, 'd1')).toBeCloseTo(0.1)
  })

  it('outdated sets staleness_days to 999', () => {
    const db = dbWithDoc(0.5)
    applyFeedback(db, 'd1', 'q', 'outdated')
    const row = db.prepare('SELECT staleness_days AS s FROM knowledge_documents WHERE id = ?').get('d1') as {
      s: number
    }
    expect(row.s).toBe(999)
  })

  it('does not throw for an unknown doc id', () => {
    const db = dbWithDoc(0.5)
    expect(() => applyFeedback(db, 'missing', 'q', 'helpful')).not.toThrow()
    expect(quality(db, 'd1')).toBe(0.5) // untouched
  })
})
