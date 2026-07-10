/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { LocalThreadStore } from '../core/thread-store/thread-store.js'
import { LiveThread } from '../core/thread-store/live-thread.js'
import type { RolloutItem } from '../core/thread-store/rollout-recorder.js'

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

describe('LiveThread', () => {
  let tmpDir: string
  let store: LocalThreadStore
  let db: Database.Database
  let threadId: string

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'live-thread-test-'))
    db = createInMemoryDb()
    store = new LocalThreadStore(db, tmpDir)
    threadId = 'test-thread-1'

    await store.createThread({
      id: threadId,
      source: 'test',
      modelProvider: 'test',
      cwd: '/tmp',
      title: 'Test Thread',
    })
  })

  afterEach(() => {
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('starts and tracks thread', async () => {
    const thread = new LiveThread(store, tmpDir, threadId)
    expect(thread.id).toBe(threadId)
    expect(thread.isActive).toBe(true)
  })

  it('appendItems calls RolloutRecorder', async () => {
    const thread = new LiveThread(store, tmpDir, threadId)
    await thread.start()

    const items: RolloutItem[] = [
      { kind: 'SessionMeta', data: { id: threadId }, timestamp: '2024-01-01T00:00:00Z' },
      { kind: 'ResponseItem', data: { role: 'assistant' }, timestamp: '2024-01-01T00:00:01Z' },
    ]
    await thread.appendItems(items)
    await thread.flush()

    const path = join(tmpDir, 'sessions', `rollout-${threadId}.jsonl`)
    expect(existsSync(path)).toBe(true)
    const lines = readFileSync(path, 'utf-8').trim().split('\n')
    expect(lines).toHaveLength(2)
    const parsed = lines.map((l) => JSON.parse(l))
    expect(parsed[0].kind).toBe('SessionMeta')
    expect(parsed[0].data.id).toBe(threadId)
    expect(parsed[1].kind).toBe('ResponseItem')
  })

  it('appendItems updates metadata', async () => {
    const thread = new LiveThread(store, tmpDir, threadId)

    const items: RolloutItem[] = [
      { kind: 'ResponseItem', data: { content: 'Hello world', tokens: 50 }, timestamp: '2024-01-01T00:00:00Z' },
      { kind: 'ResponseItem', data: { content: 'More text', tokens: 30 }, timestamp: '2024-01-01T00:00:01Z' },
    ]
    await thread.appendItems(items)

    const stored = await store.readThread({ id: threadId })
    expect(stored).not.toBeNull()
    expect(stored!.preview).toBe('Hello world')
    expect(stored!.tokensUsed).toBe(80)
  })

  it('flush delegates to recorder flush', async () => {
    const thread = new LiveThread(store, tmpDir, threadId)
    await thread.start()

    const items: RolloutItem[] = [
      { kind: 'EventMsg', data: { event: 'flush-test' }, timestamp: '2024-01-01T00:00:00Z' },
    ]
    await thread.appendItems(items)
    await thread.flush()

    const path = join(tmpDir, 'sessions', `rollout-${threadId}.jsonl`)
    expect(existsSync(path)).toBe(true)
    const lines = readFileSync(path, 'utf-8').trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]).data.event).toBe('flush-test')
  })

  it('shutdown delegates to recorder shutdown, marks thread as inactive', async () => {
    const thread = new LiveThread(store, tmpDir, threadId)
    await thread.start()

    const items: RolloutItem[] = [
      { kind: 'EventMsg', data: { event: 'shutdown-test' }, timestamp: '2024-01-01T00:00:00Z' },
    ]
    await thread.appendItems(items)
    await thread.shutdown()

    expect(thread.isActive).toBe(false)

    const path = join(tmpDir, 'sessions', `rollout-${threadId}.jsonl`)
    expect(existsSync(path)).toBe(true)
    const lines = readFileSync(path, 'utf-8').trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]).data.event).toBe('shutdown-test')
  })

  it('discard cleans up thread state', async () => {
    const thread = new LiveThread(store, tmpDir, threadId)
    await thread.start()

    await thread.discard()
    expect(thread.isActive).toBe(false)

    const stored = await store.readThread({ id: threadId })
    expect(stored).toBeNull()
  })
})
