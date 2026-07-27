/**
 * compile-source.test.ts — compileSource(db, sourceId) → CompiledPage persisted in :memory: DB.
 * ACs:
 *  1. Ingested source → persists 1 CompiledPage with non-empty structured + version===1.
 *  2. Same source recompiled → page replaced in-place with version===2 (no duplicate row).
 *  3. Source referencing 2 others → links[] contains the 2 ids.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { compileSource, type CompiledPage } from '../core/knowledge/compile-source.js'
import { McpGraphError } from '../core/utils/errors.js'

function makeDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      ref_ids TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS compiled_pages (
      source_id TEXT PRIMARY KEY,
      structured TEXT NOT NULL,
      links TEXT NOT NULL DEFAULT '[]',
      version INTEGER NOT NULL DEFAULT 1
    );
  `)
  return db
}

describe('compileSource', () => {
  let db: ReturnType<typeof makeDb>

  beforeEach(() => {
    db = makeDb()
  })

  it('AC1: persists CompiledPage with non-empty structured and version===1', () => {
    db.prepare('INSERT INTO sources (id, content) VALUES (?, ?)').run('src-1', 'Hello world content')
    const page: CompiledPage = compileSource(db, 'src-1')
    expect(page.version).toBe(1)
    expect(page.structured.length).toBeGreaterThan(0)
    // Verify persisted
    const row = db.prepare('SELECT * FROM compiled_pages WHERE source_id = ?').get('src-1') as CompiledPage & {
      source_id: string
    }
    expect(row).toBeDefined()
    expect(row.version).toBe(1)
  })

  it('AC2: recompiling same source replaces in-place with version===2', () => {
    db.prepare('INSERT INTO sources (id, content) VALUES (?, ?)').run('src-1', 'Some content')
    compileSource(db, 'src-1')
    compileSource(db, 'src-1')
    const count = (
      db.prepare('SELECT COUNT(*) as n FROM compiled_pages WHERE source_id = ?').get('src-1') as { n: number }
    ).n
    expect(count).toBe(1)
    const row = db.prepare('SELECT version FROM compiled_pages WHERE source_id = ?').get('src-1') as { version: number }
    expect(row.version).toBe(2)
  })

  it('AC3: source with 2 refs produces links[] with both ids', () => {
    db.prepare('INSERT INTO sources (id, content, ref_ids) VALUES (?, ?, ?)').run(
      'src-1',
      'References other sources',
      JSON.stringify(['ref-a', 'ref-b']),
    )
    const page: CompiledPage = compileSource(db, 'src-1')
    expect(page.links).toContain('ref-a')
    expect(page.links).toContain('ref-b')
  })

  it('throws a typed McpGraphError when sourceId does not exist (node_de0fcbb6c435)', () => {
    expect(() => compileSource(db, 'nonexistent')).toThrow(McpGraphError)
  })
})
