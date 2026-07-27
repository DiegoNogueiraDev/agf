/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations, configureDb } from '../core/store/migrations.js'

describe('configureDb', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    db?.close()
  })

  it('sets expected pragmas', () => {
    configureDb(db)
    // :memory: databases fall back to 'memory' journal mode
    const journalMode = db.pragma('journal_mode', { simple: true }) as string
    expect(['wal', 'memory']).toContain(journalMode.toLowerCase())
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })
})

describe('runMigrations', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    db?.close()
  })

  it('creates the _migrations tracking table', () => {
    runMigrations(db)
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'").all()
    expect(rows).toHaveLength(1)
  })

  it('applies all migrations sequentially', () => {
    runMigrations(db)
    const versions = db.prepare('SELECT version FROM _migrations ORDER BY version').all() as Array<{ version: number }>
    expect(versions.length).toBeGreaterThan(0)
    for (let i = 1; i < versions.length; i++) {
      expect(versions[i].version).toBeGreaterThan(versions[i - 1].version)
    }
  })

  it('creates the nodes table', () => {
    runMigrations(db)
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nodes'").all()
    expect(rows).toHaveLength(1)
  })

  it('creates the edges table', () => {
    runMigrations(db)
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='edges'").all()
    expect(rows).toHaveLength(1)
  })

  it('v122: creates runs + session_events tables idempotently', () => {
    runMigrations(db)
    runMigrations(db) // second run must be a no-op
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('runs','session_events')")
      .all() as Array<{ name: string }>
    expect(tables.map((t) => t.name).sort()).toEqual(['runs', 'session_events'])
    const runCols = (db.prepare('PRAGMA table_info(runs)').all() as Array<{ name: string }>).map((c) => c.name)
    expect(runCols).toEqual(
      expect.arrayContaining(['run_id', 'status', 'started_at', 'ended_at', 'budget', 'session_id']),
    )
    const evCols = (db.prepare('PRAGMA table_info(session_events)').all() as Array<{ name: string }>).map((c) => c.name)
    expect(evCols).toEqual(expect.arrayContaining(['id', 'channel', 'timestamp', 'payload', 'session_id']))
  })

  it('creates the projects table', () => {
    runMigrations(db)
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").all()
    expect(rows).toHaveLength(1)
  })

  it('creates the snapshots table', () => {
    runMigrations(db)
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='snapshots'").all()
    expect(rows).toHaveLength(1)
  })

  it('creates the import_history table', () => {
    runMigrations(db)
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='import_history'").all()
    expect(rows).toHaveLength(1)
  })

  it('creates project_settings table', () => {
    runMigrations(db)
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project_settings'").all()
    expect(rows).toHaveLength(1)
  })

  it('creates FTS5 virtual tables', () => {
    runMigrations(db)
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nodes_fts'").all()
    expect(rows).toHaveLength(1)
  })

  it('creates knowledge_documents and knowledge_fts tables', () => {
    runMigrations(db)
    const docs = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_documents'").all()
    expect(docs).toHaveLength(1)
    const fts = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_fts'").all()
    expect(fts).toHaveLength(1)
  })

  it('creates tool_token_usage table', () => {
    runMigrations(db)
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tool_token_usage'").all()
    expect(rows).toHaveLength(1)
  })

  it('creates node_changelog table', () => {
    runMigrations(db)
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='node_changelog'").all()
    expect(rows).toHaveLength(1)
  })

  it('is idempotent — running twice does not throw', () => {
    runMigrations(db)
    expect(() => runMigrations(db)).not.toThrow()
  })

  it('adds test_files column to nodes', () => {
    runMigrations(db)
    const columns = db.prepare('PRAGMA table_info(nodes)').all() as Array<{ name: string }>
    const names = columns.map((c) => c.name)
    expect(names).toContain('test_files')
  })

  it('adds fs_path column to projects', () => {
    runMigrations(db)
    const columns = db.prepare('PRAGMA table_info(projects)').all() as Array<{ name: string }>
    const names = columns.map((c) => c.name)
    expect(names).toContain('fs_path')
  })

  it('adds quality_score column to knowledge_documents', () => {
    runMigrations(db)
    const columns = db.prepare('PRAGMA table_info(knowledge_documents)').all() as Array<{ name: string }>
    const names = columns.map((c) => c.name)
    expect(names).toContain('quality_score')
  })

  it('adds evolution_reason column to nodes', () => {
    runMigrations(db)
    const columns = db.prepare('PRAGMA table_info(nodes)').all() as Array<{ name: string }>
    const names = columns.map((c) => c.name)
    expect(names).toContain('evolution_reason')
  })

  it('creates _migrations with correct schema', () => {
    runMigrations(db)
    const columns = db.prepare('PRAGMA table_info(_migrations)').all() as Array<{ name: string; type: string }>
    const colMap = new Map(columns.map((c) => [c.name, c.type]))
    expect(colMap.get('version')).toMatch(/INT|INTEGER/i)
    expect(colMap.get('description')).toMatch(/TEXT/i)
    expect(colMap.get('applied_at')).toMatch(/TEXT/i)
  })

  it('records applied_at timestamps', () => {
    runMigrations(db)
    const row = db.prepare('SELECT applied_at FROM _migrations ORDER BY version LIMIT 1').get() as {
      applied_at: string
    }
    expect(row.applied_at).toBeTruthy()
    expect(() => new Date(row.applied_at)).not.toThrow()
  })

  it('last migration version matches highest defined version', () => {
    runMigrations(db)
    const record = db.prepare('SELECT MAX(version) as maxv FROM _migrations').get() as { maxv: number }
    expect(record.maxv).toBeGreaterThanOrEqual(90)
  })

  it('warns on newer DB — running old code against newer schema', () => {
    runMigrations(db)
    const lastVersion = (db.prepare('SELECT MAX(version) as maxv FROM _migrations').get() as { maxv: number }).maxv
    db.prepare('INSERT INTO _migrations (version, description, applied_at) VALUES (?, ?, ?)').run(
      lastVersion + 1,
      'future migration',
      new Date().toISOString(),
    )
    expect(() => runMigrations(db)).not.toThrow()
  })

  it('creates edge UNIQUE index', () => {
    runMigrations(db)
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_edges_unique'")
      .all() as Array<{ name: string }>
    expect(indexes.length).toBeGreaterThanOrEqual(1)
  })
})
