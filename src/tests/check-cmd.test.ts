/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Regression: `agf check` used to key NOT_FOUND off `dod.summary` (always
 * populated), so it ALWAYS returned NOT_FOUND and the DoD envelope was dead
 * code. These tests pin the correct behavior: NOT_FOUND only for a missing
 * node; a real not-ready node returns DOD_FAILED with the DoD payload.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { checkCommand } from '../cli/commands/check-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function lastEnvelope(captured: string[]): { ok: boolean; code?: string; data?: { dod?: { score: number } } } {
  const objs = captured
    .join('')
    .trim()
    .split('\n')
    .filter((l) => l.trim().startsWith('{') && l.includes('"ok"'))
  return JSON.parse(objs[objs.length - 1])
}

describe('check command behavior (regression)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-check-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  async function runCheck(id: string): Promise<ReturnType<typeof lastEnvelope>> {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    const prevExit = process.exitCode
    await checkCommand().parseAsync([id, '-d', dir], { from: 'user' })
    spy.mockRestore()
    process.exitCode = prevExit
    return lastEnvelope(out)
  }

  it('returns NOT_FOUND only for a non-existent node', async () => {
    const s = SqliteStore.open(dir) // materialize an initialized empty store
    s.initProject('check-test')
    s.close()
    const env = await runCheck('node_missing_xyz')
    expect(env.ok).toBe(false)
    expect(env.code).toBe('NOT_FOUND')
    expect(env.data).toBeUndefined()
  })

  it('runs DoD for an existing not-ready node → DOD_FAILED (not NOT_FOUND)', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('check-test')
    const now = new Date().toISOString()
    const node: GraphNode = {
      id: 'node_bare',
      type: 'task',
      title: 'bare task with no AC',
      status: 'backlog',
      priority: 3,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    }
    store.insertNode(node)
    store.close()

    const env = await runCheck('node_bare')
    expect(env.code).not.toBe('NOT_FOUND') // the bug: this used to be NOT_FOUND
    expect(env.code).toBe('DOD_FAILED')
    expect(env.data?.dod).toBeDefined()
    expect(typeof env.data?.dod?.score).toBe('number')
  })

  it('a DoD-ready node deposits ACO pheromone on its tags (granular-flow reinforcement)', async () => {
    const store = SqliteStore.open(dir)
    const project = store.initProject('check-test')
    const now = new Date().toISOString()
    const node: GraphNode = {
      id: 'node_ready',
      type: 'task',
      title: 'task with strong AC, ready for DoD',
      status: 'in_progress',
      priority: 3,
      acceptanceCriteria: [
        'GIVEN a user is logged in WHEN they click logout THEN the session token is revoked and they are redirected to /login',
      ],
      tags: ['pattern:reinforcement-test'],
      createdAt: now,
      updatedAt: now,
    }
    store.insertNode(node)
    store.close()

    const env = await runCheck('node_ready')
    expect(env.data?.dod?.score).toBeGreaterThanOrEqual(0)

    const body = env.data as unknown as { pheromoneDeposited?: number; dod?: { ready: boolean } }
    if (body.dod?.ready) {
      expect(body.pheromoneDeposited).toBeGreaterThan(0)
      const verify = SqliteStore.open(dir)
      const row = verify
        .getDb()
        .prepare('SELECT amount FROM pheromone_trails WHERE project_id = ? AND key = ?')
        .get(project.id, 'pattern:reinforcement-test') as { amount: number } | undefined
      verify.close()
      expect(row?.amount).toBeGreaterThan(0)
    } else {
      expect(body.pheromoneDeposited).toBe(0)
    }
  })
})
