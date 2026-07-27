/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { WorkerStateStore } from '../core/worker-state/worker-state-store.js'
import { createRun, transitionRun } from '../core/session/run.js'
import { upsertRun } from '../core/session/run-store.js'
import { SessionSchema, GrantsSchema } from '../schemas/session.schema.js'
import {
  assembleSessionFromStore,
  compactSessions,
  computeSessionGrants,
  pollSessionEventsOnce,
  runDispatch,
  sessionCommand,
  writeThreadMessage,
} from '../cli/commands/session-cmd.js'
import { appendSessionEvent } from '../core/session/session-event-store.js'

function freshStore(): SqliteStore {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('proj-session')
  return store
}

describe('assembleSessionFromStore', () => {
  it('returns a Session that validates against SessionSchema (no threads → defaults)', async () => {
    const store = freshStore()
    try {
      const session = await assembleSessionFromStore(store, '/ws')
      expect(SessionSchema.safeParse(session).success).toBe(true)
      expect(session.identity.workspace).toBe('/ws')
    } finally {
      store.close()
    }
  })
})

describe('assembleSessionFromStore — real worker-state', () => {
  it('reflects mode + identity + model from worker-state when present', async () => {
    const store = freshStore()
    const dir = mkdtempSync(join(tmpdir(), 'sess-ws-'))
    try {
      new WorkerStateStore(dir).write({
        worker_id: 'worker-42',
        session_ref: 'sess-stable-1',
        model: 'opus',
        permission_mode: 'read-only',
        started_at: '2026-01-01T00:00:00.000Z',
        last_turn_at: '2026-01-01T00:00:00.000Z',
        cwd: dir,
      })
      const session = await assembleSessionFromStore(store, dir)
      expect(session.mode).toBe('read-only')
      expect(session.identity.sessionId).toBe('sess-stable-1')
      expect(session.identity.workerId).toBe('worker-42')
      expect(session.model.id).toBe('opus')
      expect(SessionSchema.safeParse(session).success).toBe(true)
    } finally {
      store.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reflects the active run from the runs store', async () => {
    const store = freshStore()
    const dir = mkdtempSync(join(tmpdir(), 'sess-run-'))
    try {
      new WorkerStateStore(dir).write({
        worker_id: 'w1',
        session_ref: 'sess-run-1',
        model: 'sonnet',
        permission_mode: 'workspace-write',
        started_at: '2026-01-01T00:00:00.000Z',
        last_turn_at: '2026-01-01T00:00:00.000Z',
        cwd: dir,
      })
      const run = transitionRun(createRun('run_active', { scope: 'run', currentUsd: 0, capUsd: 5 }), 'active')
      upsertRun(store.getDb(), run, 'sess-run-1')
      const session = await assembleSessionFromStore(store, dir)
      expect(session.run?.runId).toBe('run_active')
      expect(session.run?.status).toBe('active')
    } finally {
      store.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('falls back to defaults when no worker-state file exists', async () => {
    const store = freshStore()
    const dir = mkdtempSync(join(tmpdir(), 'sess-nows-'))
    try {
      const session = await assembleSessionFromStore(store, dir)
      expect(session.mode).toBe('workspace-write')
      expect(session.identity.workerId).toBe('cli')
      expect(session.identity.sessionId.length).toBeGreaterThan(0)
    } finally {
      store.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('computeSessionGrants', () => {
  it('returns one grant per capability, validating GrantsSchema', () => {
    const grants = computeSessionGrants('read-only', '/ws')
    expect(GrantsSchema.safeParse(grants).success).toBe(true)
    expect(grants.map((g) => g.capability).sort()).toEqual(['network', 'read', 'shell', 'write'])
  })

  it('denies write under read-only mode', () => {
    const grants = computeSessionGrants('read-only', '/ws')
    const write = grants.find((g) => g.capability === 'write')
    expect(write?.verdict).toBe('deny')
  })
})

describe('runDispatch', () => {
  it('set_mode produces a recorded session:mode-changed event (downward → upward loop)', async () => {
    const store = freshStore()
    try {
      const { mode, events } = await runDispatch(store, '/ws', { type: 'set_mode', mode: 'read-only' })
      expect(mode).toBe('read-only')
      expect(events.some((e) => e.channel === 'session:mode-changed')).toBe(true)
    } finally {
      store.close()
    }
  })
})

describe('runDispatch — durable set_mode', () => {
  it('persists the mode so a subsequent session show reflects it', async () => {
    const store = freshStore()
    const dir = mkdtempSync(join(tmpdir(), 'sess-dispatch-'))
    try {
      new WorkerStateStore(dir).write({
        worker_id: 'w1',
        session_ref: 'sess-d-1',
        model: 'sonnet',
        permission_mode: 'workspace-write',
        started_at: '2026-01-01T00:00:00.000Z',
        last_turn_at: '2026-01-01T00:00:00.000Z',
        cwd: dir,
      })
      const result = await runDispatch(store, dir, { type: 'set_mode', mode: 'read-only' })
      expect(result.mode).toBe('read-only')
      const session = await assembleSessionFromStore(store, dir)
      expect(session.mode).toBe('read-only') // durable — survives a fresh assemble
    } finally {
      store.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('pollSessionEventsOnce', () => {
  it('returns new events and advances the cursor; empty on the next poll', () => {
    const store = freshStore()
    try {
      appendSessionEvent(store.getDb(), { channel: 'session:message-update', timestamp: 't1', payload: {} })
      const first = pollSessionEventsOnce(store, 0)
      expect(first.events).toHaveLength(1)
      expect(first.cursor).toBeGreaterThan(0)
      const second = pollSessionEventsOnce(store, first.cursor)
      expect(second.events).toEqual([])
      expect(second.cursor).toBe(first.cursor)
    } finally {
      store.close()
    }
  })
})

describe('sessionCommand', () => {
  it('registers show, grants, events, config, subagents, dispatch, write subcommands', () => {
    const cmd = sessionCommand()
    expect(cmd.name()).toBe('session')
    expect(cmd.commands.map((c) => c.name()).sort()).toEqual([
      'compact',
      'config',
      'dispatch',
      'events',
      'grants',
      'show',
      'subagents',
      'write',
    ])
  })

  it('events subcommand accepts a --follow flag', () => {
    const events = sessionCommand().commands.find((c) => c.name() === 'events')
    expect(events).toBeDefined()
    expect(events!.options.some((o) => o.long === '--follow')).toBe(true)
  })

  it('write subcommand requires --text', () => {
    const write = sessionCommand().commands.find((c) => c.name() === 'write')
    expect(write).toBeDefined()
    const textOption = write!.options.find((o) => o.long === '--text')
    expect(textOption).toBeDefined()
    expect(textOption!.mandatory).toBe(true)
  })
})

describe('compactSessions', () => {
  it('gzip-compresses rollout files older than maxAgeDays and skips recent ones', async () => {
    const store = freshStore()
    const dir = mkdtempSync(join(tmpdir(), 'sess-compact-'))
    try {
      const { threadId } = await writeThreadMessage(store, dir, 'an old message')
      const rolloutPath = join(dir, 'sessions', `rollout-${threadId}.jsonl`)
      const { utimesSync, existsSync: fsExistsSync } = await import('node:fs')
      const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000)
      utimesSync(rolloutPath, eightDaysAgo, eightDaysAgo)

      const result = compactSessions(dir, 7)
      expect(result.compressed).toBe(1)
      expect(result.skipped).toBe(0)
      expect(fsExistsSync(rolloutPath)).toBe(false)
      expect(fsExistsSync(`${rolloutPath}.gz`)).toBe(true)
    } finally {
      store.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns zero counts when the sessions dir does not exist yet', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sess-compact-empty-'))
    try {
      expect(compactSessions(dir, 7)).toEqual({ compressed: 0, skipped: 0 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('writeThreadMessage', () => {
  it('creates a new thread and appends one item when no thread exists yet', async () => {
    const store = freshStore()
    const dir = mkdtempSync(join(tmpdir(), 'sess-write-'))
    try {
      const result = await writeThreadMessage(store, dir, 'hello world')
      expect(result.itemCount).toBe(1)
      expect(result.threadId.length).toBeGreaterThan(0)

      const threadStore = new (await import('../core/thread-store/thread-store.js')).LocalThreadStore(
        store.getDb(),
        dir,
      )
      const stored = await threadStore.readThread({ id: result.threadId })
      expect(stored).not.toBeNull()
      expect(stored!.preview).toBe('hello world')
    } finally {
      store.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reuses the existing active thread and appends a second item', async () => {
    const store = freshStore()
    const dir = mkdtempSync(join(tmpdir(), 'sess-write2-'))
    try {
      const first = await writeThreadMessage(store, dir, 'first message')
      const second = await writeThreadMessage(store, dir, 'second message')
      expect(second.threadId).toBe(first.threadId)
      expect(second.itemCount).toBe(2)
    } finally {
      store.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects an empty message', async () => {
    const store = freshStore()
    const dir = mkdtempSync(join(tmpdir(), 'sess-write3-'))
    try {
      await expect(writeThreadMessage(store, dir, '')).rejects.toThrow()
    } finally {
      store.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
