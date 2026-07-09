/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { LocalThreadStore } from '../core/thread-store/thread-store.js'
import { SessionSchema, type SessionModel } from '../schemas/session.schema.js'
import { assembleSession, setMode, threadRefFromStored } from '../core/session/session-runtime.js'

const model: SessionModel = { id: 'sonnet', provider: 'anthropic', tier: 'build' }
const baseDir = mkdtempSync(join(tmpdir(), 'session-runtime-'))

afterAll(() => rmSync(baseDir, { recursive: true, force: true }))

describe('threadRefFromStored + assembleSession (seeded :memory: store)', () => {
  it('assembles a Session that passes SessionSchema.parse', async () => {
    const db = new Database(':memory:')
    configureDb(db)
    runMigrations(db)
    const store = new SqliteStore(db)
    try {
      const ts = new LocalThreadStore(store.getDb(), baseDir)
      await ts.createThread({
        id: 'thr_1',
        source: 'test',
        modelProvider: 'anthropic',
        cwd: '/ws',
        title: 'T',
        model: 'sonnet',
        agentRole: 'implementor',
      })
      const stored = await ts.readThread({ id: 'thr_1' })
      expect(stored).not.toBeNull()
      const session = assembleSession({
        sessionId: 'sess_1',
        workerId: 'w1',
        agentRole: 'implementor',
        workspace: '/ws',
        thread: threadRefFromStored(stored!),
        mode: 'workspace-write',
        model,
      })
      expect(SessionSchema.safeParse(session).success).toBe(true)
    } finally {
      store.close()
    }
  })
})

describe('assembleSession', () => {
  const base = {
    workerId: 'w1',
    agentRole: 'implementor' as const,
    workspace: '/ws',
    thread: { id: 'thr_1', model: 'sonnet', modelProvider: 'anthropic', cwd: '/ws', agentRole: 'implementor' },
    mode: 'workspace-write' as const,
    model,
  }

  it('mints a sessionId when the lifecycle id is null', () => {
    const session = assembleSession({ ...base, sessionId: null })
    expect(session.identity.sessionId.length).toBeGreaterThan(0)
  })

  it('defaults run to null and grants to [] when not supplied', () => {
    const session = assembleSession({ ...base, sessionId: 'sess_1' })
    expect(session.run).toBeNull()
    expect(session.grants).toEqual([])
  })
})

describe('setMode', () => {
  it('returns a new Session with changed mode and unchanged identity (no mutation)', () => {
    const original = assembleSession({
      sessionId: 'sess_1',
      workerId: 'w1',
      agentRole: 'implementor',
      workspace: '/ws',
      thread: { id: 'thr_1', model: 'sonnet', modelProvider: 'anthropic', cwd: '/ws', agentRole: 'implementor' },
      mode: 'workspace-write',
      model,
    })
    const next = setMode(original, 'read-only')
    expect(next).not.toBe(original)
    expect(next.mode).toBe('read-only')
    expect(original.mode).toBe('workspace-write')
    expect(next.identity).toEqual(original.identity)
  })
})
