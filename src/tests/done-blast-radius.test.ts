/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_55da27d96539 — BLAST_RADIUS_EXCEEDED gate in `agf done`. Real git
 * repo + real SqliteStore, end-to-end through doneCommand()'s actual action —
 * "done with a leaked scope" must be refused, mirroring the existing
 * PHANTOM_TESTFILE enforcement-on-entry pattern.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { doneCommand } from '../cli/commands/done-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function runDone(taskId: string, dir: string): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  try {
    await doneCommand().parseAsync([taskId, '-d', dir, '--skip-test'], { from: 'user' })
  } finally {
    spy.mockRestore()
  }
  return lastEnvelope(out)
}

describe('agf done — BLAST_RADIUS_EXCEEDED gate', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-blast-radius-'))
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

  function addNode(store: SqliteStore, overrides: Partial<GraphNode> & { id: string }): void {
    const now = new Date().toISOString()
    store.insertNode({
      type: 'task',
      title: overrides.id,
      status: 'in_progress',
      priority: 2,
      acceptanceCriteria: ['Given X, When Y, Then a concrete observable outcome Z happens'],
      tags: [],
      createdAt: now,
      updatedAt: now,
      ...overrides,
    } as GraphNode)
  }

  it('refuses done when a modified file is undeclared, reporting BLAST_RADIUS_EXCEEDED with the undeclared list', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('blast-radius-test')
    addNode(store, { id: 'node_1', implementationFiles: ['src/a.ts'] })
    store.close()

    writeFileSync(join(dir, 'src/a.ts'), 'export const a = 2\n')
    writeFileSync(join(dir, 'src/b.ts'), 'export const b = 1\n')
    execSync('git add -A', { cwd: dir })

    const envelope = await runDone('node_1', dir)
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('BLAST_RADIUS_EXCEEDED')
    const data = envelope.data as { undeclared: string[] }
    expect(data.undeclared).toEqual(['src/b.ts'])
  })

  it('passes the gate when every modified file is declared (no regression)', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('blast-radius-test')
    addNode(store, { id: 'node_2', implementationFiles: ['src/a.ts'] })
    store.close()

    writeFileSync(join(dir, 'src/a.ts'), 'export const a = 3\n')
    execSync('git add -A', { cwd: dir })

    const envelope = await runDone('node_2', dir)
    expect(envelope.ok).toBe(true)
  })

  it('--force bypasses the gate, consistent with PHANTOM_TESTFILE', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('blast-radius-test')
    addNode(store, { id: 'node_3', implementationFiles: ['src/a.ts'] })
    store.close()

    writeFileSync(join(dir, 'src/a.ts'), 'export const a = 4\n')
    writeFileSync(join(dir, 'src/c.ts'), 'export const c = 1\n')
    execSync('git add -A', { cwd: dir })

    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await doneCommand().parseAsync(['node_3', '-d', dir, '--skip-test', '--force'], { from: 'user' })
    } finally {
      spy.mockRestore()
    }
    const envelope = lastEnvelope(out)
    expect(envelope.ok).toBe(true)
  })

  it('does not flag a package-lock.json change as scope creep (allowlisted)', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('blast-radius-test')
    addNode(store, { id: 'node_4', implementationFiles: ['src/a.ts'] })
    store.close()

    writeFileSync(join(dir, 'src/a.ts'), 'export const a = 5\n')
    writeFileSync(join(dir, 'package-lock.json'), '{}\n')
    execSync('git add -A', { cwd: dir })

    const envelope = await runDone('node_4', dir)
    expect(envelope.ok).toBe(true)
  })

  it('node_e2713eaeab4b: recognizes a staged deletion (git rm) as a modified file, not NO_FILES_MODIFIED', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('blast-radius-test')
    addNode(store, { id: 'node_5', implementationFiles: ['src/a.ts'] })
    store.close()

    execSync('git rm -q src/a.ts', { cwd: dir })

    const envelope = await runDone('node_5', dir)
    // A phantom-testfile-style check may still (correctly) flag the declared
    // implementationFiles entry as missing from disk post-deletion — that is
    // a separate, legitimate gate. What this fixes is specifically that a
    // pure deletion no longer trips NO_FILES_MODIFIED as if nothing changed.
    expect(envelope.code).not.toBe('NO_FILES_MODIFIED')
  })
})
