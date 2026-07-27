import { describe, it, expect, beforeAll } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations, configureDb } from '../core/store/migrations.js'

let db: Database.Database

beforeAll(() => {
  db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
})

describe('Migration v98 — threads table', () => {
  it('should create threads table', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='threads'").get() as
      { name: string } | undefined
    expect(row).toBeDefined()
    expect(row!.name).toBe('threads')
  })

  it('should create indexes', () => {
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='threads'").all() as {
      name: string
    }[]
    const names = indexes.map((i) => i.name)
    expect(names).toContain('idx_threads_created_at')
    expect(names).toContain('idx_threads_updated_at')
    expect(names).toContain('idx_threads_archived')
    expect(names).toContain('idx_threads_source')
    expect(names).toContain('idx_threads_provider')
  })

  it('should accept insert with all columns', () => {
    const now = Date.now()
    db.prepare(
      `
      INSERT INTO threads (id, rollout_path, created_at, updated_at, source, model_provider, cwd, title, preview, sandbox_policy, approval_mode, tokens_used, git_sha, git_branch, git_origin_url, model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      'thread-1',
      '/sessions/rollout.jsonl',
      now,
      now,
      'cli',
      'openai',
      '/home/user',
      'My Thread',
      'First message',
      'restricted',
      'on-request',
      150,
      'abc123',
      'main',
      'https://github.com/user/repo.git',
      'gpt-4',
    )

    const row = db.prepare('SELECT id, title, tokens_used, model FROM threads WHERE id = ?').get('thread-1') as Record<
      string,
      unknown
    >
    expect(row).toBeDefined()
    expect(row!.title).toBe('My Thread')
    expect(row!.tokens_used).toBe(150)
    expect(row!.model).toBe('gpt-4')
  })

  it('should list threads ordered by created_at', () => {
    const base = Date.now()
    db.prepare(
      `
      INSERT INTO threads (id, rollout_path, created_at, updated_at, title)
      VALUES (?, ?, ?, ?, ?)
    `,
    ).run('thread-old', '/o.jsonl', base - 2000, base - 2000, 'Older')
    const later = base + 5000
    db.prepare(
      `
      INSERT INTO threads (id, rollout_path, created_at, updated_at, title)
      VALUES (?, ?, ?, ?, ?)
    `,
    ).run('thread-new', '/n.jsonl', later, later, 'Newer')

    const rows = db.prepare('SELECT id, title FROM threads ORDER BY created_at DESC').all() as {
      id: string
      title: string
    }[]
    const orderedTitles = rows.map((r) => r.title)
    const olderIdx = orderedTitles.indexOf('Older')
    const newerIdx = orderedTitles.indexOf('Newer')
    expect(newerIdx).toBeLessThan(olderIdx)
  })

  it('should mark thread as archived', () => {
    const now = Date.now()
    db.prepare(
      `
      INSERT INTO threads (id, rollout_path, created_at, updated_at, title)
      VALUES (?, ?, ?, ?, ?)
    `,
    ).run('archivable', '/a.jsonl', now, now, 'To Archive')

    db.prepare('UPDATE threads SET archived = 1, archived_at = ? WHERE id = ?').run(now, 'archivable')
    const row = db.prepare("SELECT archived, archived_at FROM threads WHERE id = 'archivable'").get() as {
      archived: number
      archived_at: number
    }
    expect(row.archived).toBe(1)
    expect(row.archived_at).toBeTruthy()
  })

  it('should search threads by title preview', () => {
    const rows = db.prepare("SELECT id FROM threads WHERE title LIKE '%Thread%'").all() as { id: string }[]
    expect(rows.length).toBeGreaterThanOrEqual(1)
  })
})
