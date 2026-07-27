/*!
 * Task node_2adeea8c6717 — crossLinkOnIngest: link new facts to existing ones by term overlap.
 *
 * AC1: Given a new fact with terms shared with 2 existing facts, When crossLinkOnIngest runs,
 *      Then creates ≥1 edge related_to them and returns in linked[].
 * AC2: Given same source re-ingested, When runs again, Then no duplicate edges (idempotent).
 * AC3: Given a fact with no overlap, When runs, Then linked===[] and no edges created.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { crossLinkOnIngest, detectUnderLinkedEntities, type CrossLinkResult } from '../core/memory/ingest-crosslink.js'

function makeDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_facts (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memory_edges (
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      relation TEXT NOT NULL DEFAULT 'related_to',
      PRIMARY KEY (from_id, to_id, relation)
    );
  `)
  return db
}

function insertFact(db: ReturnType<typeof makeDb>, id: string, content: string) {
  db.prepare('INSERT INTO memory_facts (id, content) VALUES (?, ?)').run(id, content)
}

describe('crossLinkOnIngest', () => {
  it('links new fact to existing facts with shared terms (AC1)', () => {
    const db = makeDb()
    insertFact(db, 'f1', 'typescript testing vitest')
    insertFact(db, 'f2', 'typescript compiler strict mode')
    insertFact(db, 'new', 'typescript vitest blast gate')

    const result: CrossLinkResult = crossLinkOnIngest(db, 'new')
    expect(result.linked.length).toBeGreaterThanOrEqual(1)
    const edgeCount = (
      db.prepare('SELECT COUNT(*) as n FROM memory_edges WHERE from_id = ?').get('new') as { n: number }
    ).n
    expect(edgeCount).toBeGreaterThanOrEqual(1)
  })

  it('is idempotent — no duplicate edges on re-ingest (AC2)', () => {
    const db = makeDb()
    insertFact(db, 'f1', 'typescript testing vitest')
    insertFact(db, 'dup', 'typescript testing vitest overlap')

    crossLinkOnIngest(db, 'dup')
    crossLinkOnIngest(db, 'dup') // second call must not add duplicates

    const edgeCount = (
      db.prepare('SELECT COUNT(*) as n FROM memory_edges WHERE from_id = ?').get('dup') as { n: number }
    ).n
    // Count should be same as after first call
    const firstCallCount = 1
    expect(edgeCount).toBe(firstCallCount)
  })

  it('returns empty linked when no overlap (AC3)', () => {
    const db = makeDb()
    insertFact(db, 'isolated', 'completely different unique words xyz123')

    const result = crossLinkOnIngest(db, 'isolated')
    expect(result.linked).toEqual([])
    const edgeCount = (db.prepare('SELECT COUNT(*) as n FROM memory_edges').get() as { n: number }).n
    expect(edgeCount).toBe(0)
  })
})

describe('detectUnderLinkedEntities (node_911f346f34e4)', () => {
  it('AC1: entity in ≥3 facts with edge degree 0 → appears in underLinkedEntities', () => {
    const db = makeDb()
    // "authentication" appears in 3 facts, no edges for any of them
    insertFact(db, 'f1', 'authentication token jwt')
    insertFact(db, 'f2', 'authentication session cookie')
    insertFact(db, 'f3', 'authentication oauth bearer')

    const result = detectUnderLinkedEntities(db, { minFacts: 3 })
    expect(result.underLinkedEntities).toContain('authentication')
  })

  it('AC2: entity in 3 facts but already has ≥1 edge → NOT in underLinkedEntities', () => {
    const db = makeDb()
    insertFact(db, 'f1', 'authentication token jwt')
    insertFact(db, 'f2', 'authentication session cookie')
    insertFact(db, 'f3', 'authentication oauth bearer')
    // Add an edge so "authentication" is no longer under-linked
    db.prepare('INSERT INTO memory_edges (from_id, to_id, relation) VALUES (?, ?, ?)').run('f1', 'f2', 'related_to')

    const result = detectUnderLinkedEntities(db, { minFacts: 3 })
    expect(result.underLinkedEntities).not.toContain('authentication')
  })

  it('entity in only 2 facts (below threshold) → NOT flagged', () => {
    const db = makeDb()
    insertFact(db, 'f1', 'caching redis eviction')
    insertFact(db, 'f2', 'caching ttl lru')

    const result = detectUnderLinkedEntities(db, { minFacts: 3 })
    expect(result.underLinkedEntities).not.toContain('caching')
  })
})
