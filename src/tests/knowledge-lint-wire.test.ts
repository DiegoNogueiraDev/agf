/*!
 * Task node_5d11a4f57b57 — lintKnowledge extended with low_confidence/orphan/entity_drift.
 *
 * AC1: Fact in low-maturity tier → finding kind='low_confidence'.
 * AC2: Entity in ≥2 docs with no edges → finding kind='orphan'.
 * AC3: Same entity with spellings 'FooBar' and 'foo-bar' → finding kind='entity_drift'.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { lintKnowledge } from '../core/knowledge/knowledge-lint.js'

function makeDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_facts (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      tier TEXT DEFAULT 'claim'
    );
    CREATE TABLE IF NOT EXISTS memory_edges (
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      relation TEXT NOT NULL DEFAULT 'related_to',
      PRIMARY KEY (from_id, to_id, relation)
    );
    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_accessed_at TEXT
    );
  `)
  return db
}

describe('lintKnowledge extended findings', () => {
  it('emits low_confidence finding for claim-tier facts (AC1)', () => {
    const db = makeDb()
    const now = new Date().toISOString()
    db.prepare('INSERT INTO knowledge_documents (id, content, created_at) VALUES (?, ?, ?)').run(
      'd1',
      'some valid content here',
      now,
    )
    db.prepare('INSERT INTO memory_facts (id, content, tier) VALUES (?, ?, ?)').run('f1', 'some claim content', 'claim')
    const result = lintKnowledge(db)
    const lc = result.findings.filter((f) => f.reason === 'low_confidence')
    expect(lc.length).toBeGreaterThanOrEqual(1)
  })

  it('emits orphan finding for entity in ≥2 docs with no edges (AC2)', () => {
    const db = makeDb()
    const now = new Date().toISOString()
    db.prepare('INSERT INTO knowledge_documents (id, content, created_at) VALUES (?, ?, ?)').run(
      'd1',
      'typescript compiler',
      now,
    )
    db.prepare('INSERT INTO knowledge_documents (id, content, created_at) VALUES (?, ?, ?)').run(
      'd2',
      'typescript testing',
      now,
    )
    db.prepare('INSERT INTO memory_facts (id, content) VALUES (?, ?)').run('f1', 'typescript doc 1')
    db.prepare('INSERT INTO memory_facts (id, content) VALUES (?, ?)').run('f2', 'typescript doc 2')
    // No edges
    const result = lintKnowledge(db)
    const orphans = result.findings.filter((f) => f.reason === 'orphan')
    expect(orphans.length).toBeGreaterThanOrEqual(1)
  })

  it('emits entity_drift for same entity with different spellings (AC3)', () => {
    const db = makeDb()
    const now = new Date().toISOString()
    db.prepare('INSERT INTO knowledge_documents (id, content, created_at) VALUES (?, ?, ?)').run(
      'd1',
      'FooBar component',
      now,
    )
    db.prepare('INSERT INTO knowledge_documents (id, content, created_at) VALUES (?, ?, ?)').run(
      'd2',
      'foo-bar component usage',
      now,
    )
    const result = lintKnowledge(db)
    const drifts = result.findings.filter((f) => f.reason === 'entity_drift')
    expect(drifts.length).toBeGreaterThanOrEqual(1)
  })
})
