/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { LocalThreadStore, type StoredThread, type ThreadStore } from '../core/thread-store/thread-store.js'

function createInMemoryDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS threads (
      id               TEXT PRIMARY KEY,
      rollout_path     TEXT NOT NULL,
      created_at       INTEGER NOT NULL,
      updated_at       INTEGER NOT NULL,
      source           TEXT NOT NULL DEFAULT 'cli',
      model_provider   TEXT NOT NULL DEFAULT 'openai',
      cwd              TEXT NOT NULL DEFAULT '',
      title            TEXT NOT NULL DEFAULT '',
      preview          TEXT,
      sandbox_policy   TEXT NOT NULL DEFAULT 'restricted',
      approval_mode    TEXT NOT NULL DEFAULT 'on-request',
      tokens_used      INTEGER NOT NULL DEFAULT 0,
      git_sha          TEXT,
      git_branch       TEXT,
      git_origin_url   TEXT,
      archived         INTEGER NOT NULL DEFAULT 0,
      archived_at      INTEGER,
      cli_version      TEXT,
      first_user_message TEXT,
      agent_nickname   TEXT,
      agent_role       TEXT,
      model            TEXT,
      reasoning_effort TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_threads_created_at ON threads(created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_threads_updated_at ON threads(updated_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_threads_archived ON threads(archived);
    CREATE INDEX IF NOT EXISTS idx_threads_source ON threads(source);
    CREATE INDEX IF NOT EXISTS idx_threads_provider ON threads(model_provider);
  `)
  return db
}

describe('LocalThreadStore', () => {
  let tmpDir: string
  let store: ThreadStore

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'thread-store-test-'))
    const db = createInMemoryDb()
    store = new LocalThreadStore(db, tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('createThread', () => {
    it('should create a thread and persist to DB', async () => {
      await store.createThread({
        id: 'thread-1',
        source: 'cli',
        modelProvider: 'openai',
        cwd: '/home/user',
        title: 'My Thread',
        preview: 'Hello',
        model: 'gpt-4',
        gitSha: 'abc123',
        gitBranch: 'main',
        tokensUsed: 150,
      })

      const thread = await store.readThread({ id: 'thread-1' })
      expect(thread).not.toBeNull()
      expect(thread!.title).toBe('My Thread')
      expect(thread!.source).toBe('cli')
      expect(thread!.modelProvider).toBe('openai')
      expect(thread!.cwd).toBe('/home/user')
      expect(thread!.preview).toBe('Hello')
      expect(thread!.model).toBe('gpt-4')
      expect(thread!.gitSha).toBe('abc123')
      expect(thread!.gitBranch).toBe('main')
      expect(thread!.tokensUsed).toBe(150)
      expect(thread!.archived).toBe(0)
      expect(thread!.createdAt).toBeGreaterThan(0)
      expect(thread!.updatedAt).toBeGreaterThan(0)
    })

    it('should create JSONL file on disk', async () => {
      await store.createThread({
        id: 'thread-disk',
        source: 'cli',
        modelProvider: 'anthropic',
        cwd: '/tmp',
        title: 'Disk Thread',
      })

      const jsonlPath = join(tmpDir, 'sessions', 'rollout-thread-disk.jsonl')
      expect(existsSync(jsonlPath)).toBe(true)
    })
  })

  describe('readThread', () => {
    it('should return null for non-existent thread', async () => {
      const thread = await store.readThread({ id: 'does-not-exist' })
      expect(thread).toBeNull()
    })
  })

  describe('resumeThread', () => {
    it('should return the thread if it exists', async () => {
      await store.createThread({
        id: 'resume-me',
        source: 'cli',
        modelProvider: 'openai',
        cwd: '/tmp',
        title: 'Resumable',
      })

      const result = await store.resumeThread({ id: 'resume-me' })
      expect(result).not.toBeNull()
      expect(result!.title).toBe('Resumable')
    })

    it('should return null for non-existent thread', async () => {
      const result = await store.resumeThread({ id: 'nonexistent' })
      expect(result).toBeNull()
    })
  })

  describe('appendItems / loadHistory', () => {
    it('should append items and load history', async () => {
      await store.createThread({
        id: 'log-thread',
        source: 'cli',
        modelProvider: 'openai',
        cwd: '/tmp',
        title: 'Logging',
      })

      await store.appendItems({
        id: 'log-thread',
        items: [
          { kind: 'user_message', content: 'hello' },
          { kind: 'tool_call', toolName: 'read' },
        ],
      })

      const history = await store.loadHistory({ id: 'log-thread' })
      expect(history).toHaveLength(2)
      expect(history[0]!.kind).toBe('user_message')
      expect(history[0]!.content).toBe('hello')
      expect(history[1]!.kind).toBe('tool_call')
      expect(history[1]!.toolName).toBe('read')
    })

    it('should return empty array for non-existent thread', async () => {
      const history = await store.loadHistory({ id: 'no-such-thread' })
      expect(history).toEqual([])
    })

    it('should write items to JSONL file', async () => {
      await store.createThread({
        id: 'jsonl-check',
        source: 'cli',
        modelProvider: 'openai',
        cwd: '/tmp',
        title: 'JSONL',
      })

      await store.appendItems({
        id: 'jsonl-check',
        items: [{ kind: 'user_message', content: 'persist me' }],
      })

      const jsonlPath = join(tmpDir, 'sessions', 'rollout-jsonl-check.jsonl')
      const content = readFileSync(jsonlPath, 'utf-8')
      const lines = content.split('\n').filter((l) => l.trim())
      expect(lines).toHaveLength(1)
      const parsed = JSON.parse(lines[0]!)
      expect(parsed.kind).toBe('user_message')
      expect(parsed.content).toBe('persist me')
    })

    it('should support pagination in loadHistory', async () => {
      await store.createThread({
        id: 'paginated',
        source: 'cli',
        modelProvider: 'openai',
        cwd: '/tmp',
        title: 'Pagination',
      })

      const items = Array.from({ length: 10 }, (_, i) => ({ kind: 'item', content: `msg-${i}` }))
      await store.appendItems({ id: 'paginated', items })

      const page1 = await store.loadHistory({ id: 'paginated', limit: 3, offset: 0 })
      expect(page1).toHaveLength(3)
      expect(page1[0]!.content).toBe('msg-0')

      const page2 = await store.loadHistory({ id: 'paginated', limit: 3, offset: 3 })
      expect(page2).toHaveLength(3)
      expect(page2[0]!.content).toBe('msg-3')

      const page3 = await store.loadHistory({ id: 'paginated', limit: 10, offset: 10 })
      expect(page3).toHaveLength(0)
    })
  })

  describe('listThreads', () => {
    it('should list threads with pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await store.createThread({
          id: `list-thread-${i}`,
          source: 'cli',
          modelProvider: 'openai',
          cwd: '/tmp',
          title: `Thread ${i}`,
        })
      }

      const page1 = await store.listThreads({ limit: 2, offset: 0 })
      expect(page1.threads).toHaveLength(2)
      expect(page1.hasMore).toBe(true)
      expect(page1.total).toBe(5)

      const pageAll = await store.listThreads({ limit: 10 })
      expect(pageAll.threads).toHaveLength(5)
      expect(pageAll.hasMore).toBe(false)
    })

    it('should exclude archived threads by default', async () => {
      await store.createThread({
        id: 'active-1',
        source: 'cli',
        modelProvider: 'openai',
        cwd: '/tmp',
        title: 'Active',
      })
      await store.createThread({
        id: 'archived-1',
        source: 'cli',
        modelProvider: 'openai',
        cwd: '/tmp',
        title: 'Archived',
      })
      await store.archiveThread({ id: 'archived-1' })

      const page = await store.listThreads({})
      const ids = page.threads.map((t) => t.id)
      expect(ids).toContain('active-1')
      expect(ids).not.toContain('archived-1')
    })

    it('should include archived threads when asked', async () => {
      await store.createThread({
        id: 'active-2',
        source: 'cli',
        modelProvider: 'openai',
        cwd: '/tmp',
        title: 'Active',
      })
      await store.createThread({
        id: 'archived-2',
        source: 'cli',
        modelProvider: 'openai',
        cwd: '/tmp',
        title: 'Archived',
      })
      await store.archiveThread({ id: 'archived-2' })

      const page = await store.listThreads({ includeArchived: true })
      const ids = page.threads.map((t) => t.id)
      expect(ids).toContain('active-2')
      expect(ids).toContain('archived-2')
    })
  })

  describe('searchThreads', () => {
    it('should search by title', async () => {
      await store.createThread({
        id: 'search-1',
        source: 'cli',
        modelProvider: 'openai',
        cwd: '/tmp',
        title: 'Fix Login Bug',
      })
      await store.createThread({
        id: 'search-2',
        source: 'cli',
        modelProvider: 'openai',
        cwd: '/tmp',
        title: 'Add Search Feature',
      })

      const result = await store.searchThreads({ query: 'Login' })
      expect(result.threads).toHaveLength(1)
      expect(result.threads[0]!.id).toBe('search-1')
    })

    it('should search by preview', async () => {
      await store.createThread({
        id: 'preview-search',
        source: 'cli',
        modelProvider: 'openai',
        cwd: '/tmp',
        title: 'Some Thread',
        preview: 'Working on authentication flow',
      })

      const result = await store.searchThreads({ query: 'authentication' })
      expect(result.threads).toHaveLength(1)
      expect(result.threads[0]!.id).toBe('preview-search')
    })

    it('should return empty for no matches', async () => {
      const result = await store.searchThreads({ query: 'zzzzzzzzzz' })
      expect(result.threads).toHaveLength(0)
    })

    it('should respect pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await store.createThread({
          id: `s-pag-${i}`,
          source: 'cli',
          modelProvider: 'openai',
          cwd: '/tmp',
          title: `Searchable ${i}`,
        })
      }

      const result = await store.searchThreads({ query: 'Searchable', limit: 2, offset: 0 })
      expect(result.threads).toHaveLength(2)
      expect(result.hasMore).toBe(true)
    })
  })

  describe('archive / unarchive', () => {
    it('should archive a thread', async () => {
      await store.createThread({
        id: 'to-archive',
        source: 'cli',
        modelProvider: 'openai',
        cwd: '/tmp',
        title: 'Archive Me',
      })

      await store.archiveThread({ id: 'to-archive' })

      const thread = await store.readThread({ id: 'to-archive' })
      expect(thread!.archived).toBe(1)
      expect(thread!.archivedAt).toBeGreaterThan(0)
    })

    it('should unarchive a thread', async () => {
      await store.createThread({
        id: 'to-unarchive',
        source: 'cli',
        modelProvider: 'openai',
        cwd: '/tmp',
        title: 'Unarchive Me',
      })

      await store.archiveThread({ id: 'to-unarchive' })
      await store.unarchiveThread({ id: 'to-unarchive' })

      const thread = await store.readThread({ id: 'to-unarchive' })
      expect(thread!.archived).toBe(0)
      expect(thread!.archivedAt).toBeNull()
    })
  })

  describe('updateThreadMetadata', () => {
    it('should update thread metadata in DB', async () => {
      await store.createThread({
        id: 'updatable',
        source: 'cli',
        modelProvider: 'openai',
        cwd: '/tmp',
        title: 'Original',
        tokensUsed: 100,
      })

      const updated = await store.updateThreadMetadata({
        id: 'updatable',
        title: 'Updated Title',
        tokensUsed: 200,
        model: 'gpt-4-turbo',
      })

      expect(updated.title).toBe('Updated Title')
      expect(updated.tokensUsed).toBe(200)
      expect(updated.model).toBe('gpt-4-turbo')
      expect(updated.updatedAt).toBeGreaterThanOrEqual(updated.createdAt)
    })
  })

  describe('discardThread', () => {
    it('should delete thread from DB', async () => {
      await store.createThread({
        id: 'discard-me',
        source: 'cli',
        modelProvider: 'openai',
        cwd: '/tmp',
        title: 'Discard',
      })

      await store.discardThread('discard-me')
      const thread = await store.readThread({ id: 'discard-me' })
      expect(thread).toBeNull()
    })
  })
})
