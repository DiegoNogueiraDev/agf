/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_e97a9b80572f — E2.1: agf quality --knowledge-store RAG health score
 *
 * AC: returns {score, grade A/B/C/D/F, total_docs, valid_docs, stale_docs};
 *     valid: content_hash!=null AND content.length>=50;
 *     stale: >90 days without update
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import {
  scoreKnowledgeStore,
  gradeKnowledgeStore,
  type KnowledgeStoreHealth,
} from '../core/rag/knowledge-store-health.js'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE knowledge_documents (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  return db
}

function insertDoc(
  db: Database.Database,
  opts: {
    id: string
    content: string
    content_hash?: string
    daysAgo?: number
  },
): void {
  const daysAgo = opts.daysAgo ?? 0
  const updatedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
  db.prepare(`INSERT INTO knowledge_documents VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    opts.id,
    'node',
    'src',
    'title',
    opts.content,
    opts.content_hash ?? 'hash-' + opts.id,
    0,
    null,
    new Date().toISOString(),
    updatedAt,
  )
}

// ── gradeKnowledgeStore ────────────────────────────────────────────────────────

describe('gradeKnowledgeStore', () => {
  it('returns A for score >= 90', () => expect(gradeKnowledgeStore(90)).toBe('A'))
  it('returns B for 75 <= score < 90', () => expect(gradeKnowledgeStore(75)).toBe('B'))
  it('returns C for 60 <= score < 75', () => expect(gradeKnowledgeStore(60)).toBe('C'))
  it('returns D for 40 <= score < 60', () => expect(gradeKnowledgeStore(40)).toBe('D'))
  it('returns F for score < 40', () => expect(gradeKnowledgeStore(0)).toBe('F'))
})

// ── scoreKnowledgeStore ────────────────────────────────────────────────────────

describe('scoreKnowledgeStore', () => {
  it('returns total_docs=0 and grade=F when no documents', () => {
    const db = makeDb()
    const result = scoreKnowledgeStore(db)
    expect(result.total_docs).toBe(0)
    expect(result.grade).toBe('F')
  })

  it('counts valid docs: content.length >= 50 AND content_hash non-empty', () => {
    const db = makeDb()
    insertDoc(db, { id: 'valid', content: 'A'.repeat(50) })
    insertDoc(db, { id: 'short', content: 'tiny' })
    insertDoc(db, { id: 'empty-hash', content: 'A'.repeat(100), content_hash: '' })
    const result = scoreKnowledgeStore(db)
    expect(result.valid_docs).toBe(1)
  })

  it('counts stale docs: updated_at > 90 days ago', () => {
    const db = makeDb()
    insertDoc(db, { id: 'fresh', content: 'A'.repeat(100), daysAgo: 10 })
    insertDoc(db, { id: 'stale', content: 'A'.repeat(100), daysAgo: 100 })
    const result = scoreKnowledgeStore(db)
    expect(result.stale_docs).toBe(1)
  })

  it('returns score 100 when all docs are valid and non-stale', () => {
    const db = makeDb()
    insertDoc(db, { id: 'doc1', content: 'A'.repeat(100), daysAgo: 0 })
    insertDoc(db, { id: 'doc2', content: 'B'.repeat(200), daysAgo: 5 })
    const result = scoreKnowledgeStore(db)
    expect(result.score).toBe(100)
    expect(result.grade).toBe('A')
  })

  it('returns score 0 when no valid docs', () => {
    const db = makeDb()
    insertDoc(db, { id: 'short', content: 'tiny', daysAgo: 0 })
    const result = scoreKnowledgeStore(db)
    expect(result.score).toBe(0)
    expect(result.grade).toBe('F')
  })

  it('reflects correct total_docs count', () => {
    const db = makeDb()
    insertDoc(db, { id: 'a', content: 'A'.repeat(100) })
    insertDoc(db, { id: 'b', content: 'B'.repeat(100) })
    insertDoc(db, { id: 'c', content: 'tiny' })
    const result = scoreKnowledgeStore(db)
    expect(result.total_docs).toBe(3)
  })

  it('returns result with all required fields', () => {
    const db = makeDb()
    const result: KnowledgeStoreHealth = scoreKnowledgeStore(db)
    expect(result).toHaveProperty('score')
    expect(result).toHaveProperty('grade')
    expect(result).toHaveProperty('total_docs')
    expect(result).toHaveProperty('valid_docs')
    expect(result).toHaveProperty('stale_docs')
  })
})
