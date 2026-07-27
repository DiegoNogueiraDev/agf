import Database from 'better-sqlite3'
import { describe, it, expect } from 'vitest'
import { listGeneratedArtifacts } from '../core/scaffolder/couple.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'

function makeStore(): Pick<SqliteStore, 'getDb' | 'getProject'> {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS generated_artifacts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      node_id TEXT,
      kinds TEXT NOT NULL DEFAULT '[]',
      paths TEXT NOT NULL DEFAULT '[]',
      signature TEXT,
      covered INTEGER DEFAULT 0,
      applied INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `)
  return {
    getDb: () => db,
    getProject: () => ({ id: 'proj_test' }) as never,
  }
}

describe('listGeneratedArtifacts', () => {
  it('returns empty list when no artifacts exist', () => {
    const store = makeStore()
    expect(listGeneratedArtifacts(store as SqliteStore)).toEqual([])
  })

  it('returns artifacts for the current project', () => {
    const store = makeStore()
    const db = store.getDb()
    db.prepare(
      `INSERT INTO generated_artifacts (id, project_id, node_id, kinds, paths, signature, applied, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('gen_1', 'proj_test', 'node_abc', '["ts","fn"]', '["src/x.ts"]', 'sig_1', 1, 1_000_000)
    const rows = listGeneratedArtifacts(store as SqliteStore)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('gen_1')
    expect(rows[0].kinds).toEqual(['ts', 'fn'])
    expect(rows[0].paths).toEqual(['src/x.ts'])
    expect(rows[0].applied).toBe(true)
  })

  it('excludes artifacts from other projects', () => {
    const store = makeStore()
    const db = store.getDb()
    db.prepare(
      `INSERT INTO generated_artifacts (id, project_id, node_id, kinds, paths, signature, applied, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('gen_x', 'other_proj', null, '[]', '[]', 'sig_x', 0, 1_000_000)
    expect(listGeneratedArtifacts(store as SqliteStore)).toHaveLength(0)
  })

  it('respects the limit parameter', () => {
    const store = makeStore()
    const db = store.getDb()
    for (let i = 0; i < 5; i++) {
      db.prepare(
        `INSERT INTO generated_artifacts (id, project_id, node_id, kinds, paths, signature, applied, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(`gen_${i}`, 'proj_test', null, '[]', '[]', `sig_${i}`, 0, i)
    }
    expect(listGeneratedArtifacts(store as SqliteStore, 3)).toHaveLength(3)
  })

  it('orders by created_at descending (newest first)', () => {
    const store = makeStore()
    const db = store.getDb()
    db.prepare(
      `INSERT INTO generated_artifacts (id, project_id, node_id, kinds, paths, signature, applied, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('old', 'proj_test', null, '[]', '[]', 'sig_old', 0, 1000)
    db.prepare(
      `INSERT INTO generated_artifacts (id, project_id, node_id, kinds, paths, signature, applied, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('new', 'proj_test', null, '[]', '[]', 'sig_new', 0, 9000)
    const rows = listGeneratedArtifacts(store as SqliteStore)
    expect(rows[0].id).toBe('new')
    expect(rows[1].id).toBe('old')
  })
})
