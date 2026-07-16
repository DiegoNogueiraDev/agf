/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { doneTaskPipeline, doneCommand, type DoneDeps } from '../cli/commands/done-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

describe('doneTaskPipeline', () => {
  const mockDeps: DoneDeps = {
    findCurrentTask: () => ({ id: 'task-1', title: 'Do something' }),
    runDoD: (id: string) => ({ passed: true, score: 92, grade: 'A' }),
    storeMemory: (id: string) => `Memory stored for ${id}`,
    markDone: (id: string) => id,
    suggestNext: () => ({ id: 'task-2', title: 'Next thing', reason: 'high priority' }),
    out: () => {},
  }

  it('runs full pipeline and returns result', () => {
    const result = doneTaskPipeline('task-1', mockDeps)
    expect(result.taskId).toBe('task-1')
    expect(result.dodPassed).toBe(true)
    expect(result.dodScore).toBe(92)
    expect(result.nextTask).toBe('task-2')
  })

  it('handles DoD failure', () => {
    const deps: DoneDeps = {
      ...mockDeps,
      runDoD: () => ({ passed: false, score: 45, grade: 'F' }),
    }
    const result = doneTaskPipeline('task-1', deps)
    expect(result.dodPassed).toBe(false)
    expect(result.nextTask).toBeNull()
  })

  it('handles no next task', () => {
    const deps: DoneDeps = {
      ...mockDeps,
      suggestNext: () => null,
    }
    const result = doneTaskPipeline('task-1', deps)
    expect(result.nextTask).toBeNull()
    expect(result.dodPassed).toBe(true)
  })

  it('handles empty taskId', () => {
    const result = doneTaskPipeline('', mockDeps)
    expect(result.dodPassed).toBe(false)
    expect(result.error).toBe('No task specified')
  })
})

describe('done command registration', () => {
  it('exports doneCommand function', async () => {
    const mod = await import('../cli/commands/done-cmd.js')
    expect(typeof mod.doneCommand).toBe('function')
  })
})

describe('agf done — honesty invariant for externally-blocked nodes', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-done-honesty-'))
    execSync('git init -q', { cwd: dir })
    execSync('git config user.email test@test.com', { cwd: dir })
    execSync('git config user.name test', { cwd: dir })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
    writeFileSync(join(dir, '.gitignore'), 'workflow-graph/\n')
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src/a.ts'), 'export const a = 1\n')
    execSync('git add -A && git commit -q -m baseline', { cwd: dir })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function runDone(taskId: string, args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await doneCommand().parseAsync([taskId, '-d', dir, ...args], { from: 'user' })
    } finally {
      spy.mockRestore()
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  it('refuses done on an externally-blocked node, even with --force', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('done-honesty-test')
    const now = new Date().toISOString()
    store.insertNode({
      id: 'node_infra',
      type: 'task',
      title: 'provision Vault secret',
      status: 'in_progress',
      priority: 3,
      blocked: true,
      metadata: { blockReason: 'Vault secret provisioning pending' },
      acceptanceCriteria: ['Given X, When Y, Then a concrete observable outcome Z happens'],
      tags: [],
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    store.close()

    const envelope = await runDone('node_infra', ['--skip-test', '--force'])
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('EXTERNAL_BLOCKED_DONE')

    const verifyStore = SqliteStore.open(dir)
    const node = verifyStore.getNodeById('node_infra')
    verifyStore.close()
    expect(node?.status).toBe('in_progress')
  })

  it('allows done on a node that is not externally blocked (no regression)', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('done-honesty-test')
    const now = new Date().toISOString()
    store.insertNode({
      id: 'node_clean',
      type: 'task',
      title: 'regular task',
      status: 'in_progress',
      priority: 3,
      acceptanceCriteria: ['Given X, When Y, Then a concrete observable outcome Z happens'],
      tags: [],
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    store.close()

    const envelope = await runDone('node_clean', ['--skip-test', '--force'])
    expect(envelope.ok).toBe(true)
  })
})
