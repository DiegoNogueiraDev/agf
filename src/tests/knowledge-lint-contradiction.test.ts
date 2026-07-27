/*!
 * Task node_1ee9ba3287d5 — contradiction detection via runDialecticEngine.
 *
 * AC1: Contradicting facts (e.g., 'X=true' and 'X=false') → ≥1 finding with reason 'contradiction'.
 * AC2: No-conflict facts → zero 'contradiction' findings.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { lintKnowledge } from '../core/knowledge/knowledge-lint.js'

function makeDb(): ReturnType<typeof Database> {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE knowledge_documents (id TEXT, content TEXT, created_at TEXT, last_accessed_at TEXT);
    INSERT INTO knowledge_documents VALUES ('doc1','hello world','2024-01-01',NULL);
    CREATE TABLE memory_facts (id TEXT, content TEXT, tier TEXT, updated_at TEXT);
  `)
  return db
}

describe('lintKnowledge — contradiction detection', () => {
  it('emits contradiction finding when two facts share the same semantic key (AC1)', () => {
    const db = makeDb()
    db.exec(`
      INSERT INTO memory_facts VALUES ('fact1', 'X=true', 'verified', '2024-01-01');
      INSERT INTO memory_facts VALUES ('fact2', 'X=false', 'verified', '2024-01-02');
    `)
    const result = lintKnowledge(db)
    const contradictions = result.findings.filter((f) => f.reason === 'contradiction')
    expect(contradictions.length).toBeGreaterThanOrEqual(1)
    db.close()
  })

  it('emits no contradiction when facts do not conflict (AC2)', () => {
    const db = makeDb()
    db.exec(`
      INSERT INTO memory_facts VALUES ('fact1', 'A=1', 'verified', '2024-01-01');
      INSERT INTO memory_facts VALUES ('fact2', 'B=2', 'verified', '2024-01-02');
    `)
    const result = lintKnowledge(db)
    const contradictions = result.findings.filter((f) => f.reason === 'contradiction')
    expect(contradictions.length).toBe(0)
    db.close()
  })
})
