/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_a9d86c3604a4 AC coverage: heal-knowledge.ts
 *
 * AC1: --dry-run lists invalid docs without removing
 * AC2: --apply removes stale (>90d) and invalid docs
 * AC3: returns { removed, kept, savedTokens }
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { healKnowledge } from '../core/knowledge/heal-knowledge.js'

// ── DB setup ──────────────────────────────────────────────────────────────────

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
      metadata      TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      last_accessed_at TEXT,
      staleness_days   INTEGER DEFAULT 0,
      quality_score    REAL,
      usage_count      INTEGER DEFAULT 0,
      recency_score    REAL
    );
  `)
  return db
}

const NOW = new Date()
const OLD = new Date(NOW.getTime() - 91 * 24 * 60 * 60 * 1000).toISOString() // 91 days ago
const RECENT = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString() // 10 days ago

function insertDoc(
  db: Database.Database,
  id: string,
  opts: {
    content?: string
    sourceType?: string
    createdAt?: string
    lastAccessedAt?: string | null
  } = {},
) {
  const {
    content = 'valid content with enough text to pass validation',
    sourceType = 'task',
    createdAt = RECENT,
    lastAccessedAt = RECENT,
  } = opts
  db.prepare(
    `INSERT INTO knowledge_documents
      (id, source_type, source_id, title, content, content_hash, created_at, updated_at, last_accessed_at, staleness_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, sourceType, `src:${id}`, `Doc ${id}`, content, `hash_${id}`, createdAt, createdAt, lastAccessedAt, 0)
}

// ── AC1: dry-run ──────────────────────────────────────────────────────────────

describe('healKnowledge dry-run', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeDb()
  })

  it('AC1: returns removed=0 on dry-run even with invalid docs', () => {
    insertDoc(db, 'doc1', { content: 'short' }) // invalid: length < 20
    const result = healKnowledge(db, { dryRun: true })
    expect(result.removed).toBe(0)
  })

  it('AC1: lists contaminated doc ids without deleting', () => {
    insertDoc(db, 'bad1', { content: 'tiny' })
    const result = healKnowledge(db, { dryRun: true })
    expect(result.contaminated).toContain('bad1')
    // verify doc still in DB
    const row = db.prepare('SELECT id FROM knowledge_documents WHERE id = ?').get('bad1')
    expect(row).toBeTruthy()
  })

  it('AC1: valid long-content doc not in contaminated list', () => {
    insertDoc(db, 'good1')
    const result = healKnowledge(db, { dryRun: true })
    expect(result.contaminated).not.toContain('good1')
  })

  it('AC1: empty DB returns removed=0 kept=0', () => {
    const result = healKnowledge(db, { dryRun: true })
    expect(result.removed).toBe(0)
    expect(result.kept).toBe(0)
  })
})

// ── AC2: apply ────────────────────────────────────────────────────────────────

describe('healKnowledge apply', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeDb()
  })

  it('AC2: removes doc with content length < 20', () => {
    insertDoc(db, 'short1', { content: 'tiny' })
    healKnowledge(db, { dryRun: false })
    const row = db.prepare('SELECT id FROM knowledge_documents WHERE id = ?').get('short1')
    expect(row).toBeUndefined()
  })

  it('AC2: removes stale doc (last_accessed_at older than 90 days)', () => {
    insertDoc(db, 'stale1', { createdAt: OLD, lastAccessedAt: OLD })
    healKnowledge(db, { dryRun: false })
    const row = db.prepare('SELECT id FROM knowledge_documents WHERE id = ?').get('stale1')
    expect(row).toBeUndefined()
  })

  it('AC2: keeps valid recently-accessed doc', () => {
    insertDoc(db, 'valid1')
    healKnowledge(db, { dryRun: false })
    const row = db.prepare('SELECT id FROM knowledge_documents WHERE id = ?').get('valid1')
    expect(row).toBeTruthy()
  })

  it('AC2: keeps recently-created doc even with no last_accessed_at', () => {
    insertDoc(db, 'new1', { lastAccessedAt: null })
    healKnowledge(db, { dryRun: false })
    const row = db.prepare('SELECT id FROM knowledge_documents WHERE id = ?').get('new1')
    expect(row).toBeTruthy()
  })

  it('AC2: removes stale doc with no last_accessed_at (falls back to created_at)', () => {
    insertDoc(db, 'old_no_access', { createdAt: OLD, lastAccessedAt: null })
    healKnowledge(db, { dryRun: false })
    const row = db.prepare('SELECT id FROM knowledge_documents WHERE id = ?').get('old_no_access')
    expect(row).toBeUndefined()
  })

  it('AC2: counts removed correctly', () => {
    insertDoc(db, 'bad1', { content: 'no' })
    insertDoc(db, 'bad2', { createdAt: OLD, lastAccessedAt: OLD })
    insertDoc(db, 'good1')
    const result = healKnowledge(db, { dryRun: false })
    expect(result.removed).toBe(2)
    expect(result.kept).toBe(1)
  })
})

// ── AC3: return shape ─────────────────────────────────────────────────────────

describe('healKnowledge return shape', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeDb()
  })

  it('AC3: result has removed, kept, savedTokens, contaminated', () => {
    const result = healKnowledge(db, { dryRun: false })
    expect(typeof result.removed).toBe('number')
    expect(typeof result.kept).toBe('number')
    expect(typeof result.savedTokens).toBe('number')
    expect(Array.isArray(result.contaminated)).toBe(true)
  })

  it('AC3: savedTokens estimates tokens from removed content lengths', () => {
    // stale docs (>90 days) with long content get removed → savedTokens > 0
    insertDoc(db, 'r1', { content: 'a'.repeat(400), createdAt: OLD, lastAccessedAt: OLD })
    insertDoc(db, 'r2', { content: 'b'.repeat(800), createdAt: OLD, lastAccessedAt: OLD })
    const result = healKnowledge(db, { dryRun: false })
    // savedTokens = ceil((400+800) / 4) = 300
    expect(result.savedTokens).toBeGreaterThan(0)
  })

  it('AC3: savedTokens=0 when nothing removed', () => {
    insertDoc(db, 'keep1')
    const result = healKnowledge(db, { dryRun: false })
    expect(result.savedTokens).toBe(0)
  })

  it('AC3: removed + kept = total docs in DB', () => {
    insertDoc(db, 'bad1', { content: 'tiny' })
    insertDoc(db, 'good1')
    insertDoc(db, 'good2')
    const result = healKnowledge(db, { dryRun: false })
    const total = db.prepare('SELECT COUNT(*) as n FROM knowledge_documents').get() as { n: number }
    expect(result.kept).toBe(total.n)
    expect(result.removed + result.kept).toBe(3)
  })
})
