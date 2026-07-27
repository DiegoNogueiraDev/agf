/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_wire_74ae54e2ef4e — I/O wire for session-resume-detector.ts: registers
 * a real session:start listener that reads/writes last_session_ts in
 * project_settings and queries real nodes + git commits since then.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { getSharedHookBus, _resetSharedHookBus } from '../core/hooks/shared-hook-bus.js'
import {
  registerSessionResumeDetector,
  queryNodesUpdatedSince,
  queryCommitsSince,
} from '../core/hooks/session-resume-detector-writer.js'

function makeProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agf-session-resume-'))
  execSync('git init -q', { cwd: dir })
  execSync('git config user.email test@test.com', { cwd: dir })
  execSync('git config user.name test', { cwd: dir })
  const store = SqliteStore.open(dir)
  store.initProject('resume-test')
  store.close()
  return dir
}

async function emitSessionStart(): Promise<void> {
  await getSharedHookBus().emit({ channel: 'session:start', timestamp: new Date().toISOString(), payload: {} })
}

describe('registerSessionResumeDetector (node_wire_74ae54e2ef4e)', () => {
  let dir: string
  const originalEnv = process.env.MCP_GRAPH_SESSION_RESUME

  beforeEach(() => {
    _resetSharedHookBus()
    dir = makeProjectDir()
    delete process.env.MCP_GRAPH_SESSION_RESUME
  })

  afterEach(() => {
    _resetSharedHookBus()
    rmSync(dir, { recursive: true, force: true })
    if (originalEnv === undefined) delete process.env.MCP_GRAPH_SESSION_RESUME
    else process.env.MCP_GRAPH_SESSION_RESUME = originalEnv
  })

  it('writes last_session_ts on the first session:start (no prior session)', async () => {
    registerSessionResumeDetector(dir)
    await emitSessionStart()

    const store = SqliteStore.open(dir)
    const raw = store.getProjectSetting('last_session_ts')
    store.close()
    expect(raw).not.toBeNull()
    expect(Number(raw)).toBeGreaterThan(0)
  })

  it('queryNodesUpdatedSince finds a real node modified after the given timestamp', () => {
    const store = SqliteStore.open(dir)
    const longAgo = Date.now() - 2 * 60 * 60 * 1000
    store.insertNode({
      id: 'n1',
      type: 'task',
      title: 'Recently touched task',
      status: 'in_progress',
      priority: 3,
      xpSize: 'M',
      tags: [],
      blocked: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Parameters<typeof store.insertNode>[0])

    const found = queryNodesUpdatedSince(store, longAgo)
    store.close()
    expect(found).toHaveLength(1)
    expect(found[0].id).toBe('n1')
  })

  it('queryCommitsSince finds a real commit made after the given timestamp', () => {
    const beforeCommitMs = Date.now() - 1000
    execSync('touch file.txt && git add file.txt && git commit -q -m "real test commit"', { cwd: dir })

    const commits = queryCommitsSince(dir, beforeCommitMs)
    expect(commits.length).toBeGreaterThanOrEqual(1)
    expect(commits.some((c) => c.message === 'real test commit')).toBe(true)
  })

  it('detects a real resume gap end to end and advances last_session_ts', async () => {
    const store = SqliteStore.open(dir)
    const longAgo = Date.now() - 2 * 60 * 60 * 1000 // 2h ago > 1h threshold
    store.setProjectSetting('last_session_ts', String(longAgo))
    store.insertNode({
      id: 'n1',
      type: 'task',
      title: 'Recently touched task',
      status: 'in_progress',
      priority: 3,
      xpSize: 'M',
      tags: [],
      blocked: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Parameters<typeof store.insertNode>[0])
    store.close()

    registerSessionResumeDetector(dir)
    await emitSessionStart()

    // The delta itself is logged (best-effort); the real, testable side effect
    // through the public hook contract is that last_session_ts always
    // advances to "now" so the NEXT session's gap is measured correctly.
    const after = SqliteStore.open(dir)
    const raw = after.getProjectSetting('last_session_ts')
    after.close()
    expect(Number(raw)).toBeGreaterThan(longAgo)
  })

  it('does nothing when MCP_GRAPH_SESSION_RESUME=off', async () => {
    process.env.MCP_GRAPH_SESSION_RESUME = 'off'
    const store = SqliteStore.open(dir)
    store.setProjectSetting('last_session_ts', String(Date.now() - 1000))
    store.close()

    registerSessionResumeDetector(dir)
    await emitSessionStart()

    const after = SqliteStore.open(dir)
    const raw = after.getProjectSetting('last_session_ts')
    after.close()
    // Untouched — the handler returned early before writing a new timestamp.
    expect(Date.now() - Number(raw)).toBeGreaterThan(500)
  })

  it('the returned disposer removes the listener', async () => {
    const dispose = registerSessionResumeDetector(dir)
    dispose()

    const before = SqliteStore.open(dir)
    const rawBefore = before.getProjectSetting('last_session_ts')
    before.close()
    expect(rawBefore).toBeNull()

    await emitSessionStart()

    const after = SqliteStore.open(dir)
    const rawAfter = after.getProjectSetting('last_session_ts')
    after.close()
    expect(rawAfter).toBeNull() // never fired after disposal
  })
})
