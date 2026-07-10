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
  computeSessionGrants,
  pollSessionEventsOnce,
  runDispatch,
  sessionCommand,
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
  it('registers show, grants, events, config, subagents, dispatch subcommands', () => {
    const cmd = sessionCommand()
    expect(cmd.name()).toBe('session')
    expect(cmd.commands.map((c) => c.name()).sort()).toEqual([
      'config',
      'dispatch',
      'events',
      'grants',
      'show',
      'subagents',
    ])
  })

  it('events subcommand accepts a --follow flag', () => {
    const events = sessionCommand().commands.find((c) => c.name() === 'events')
    expect(events).toBeDefined()
    expect(events!.options.some((o) => o.long === '--follow')).toBe(true)
  })
})
