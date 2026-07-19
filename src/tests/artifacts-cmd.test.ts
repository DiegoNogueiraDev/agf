/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/artifacts-cmd.ts — artifactsCommand factory wiring
 * (node_wire_d4c4d31ad37b — subtask-artifacts-store wire).
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { artifactsCommand } from '../cli/commands/artifacts-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'

describe('artifactsCommand', () => {
  it('builds the "artifacts" command with a description', () => {
    const cmd = artifactsCommand()
    expect(cmd.name()).toBe('artifacts')
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('wires 3 subcommands (add/list/get)', () => {
    expect(artifactsCommand().commands.length).toBe(3)
  })
})

describe('artifactsCommand add/list/get (node_wire_d4c4d31ad37b — subtask-artifacts-store wire)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await artifactsCommand().parseAsync(args, { from: 'user' })
    } finally {
      spy.mockRestore()
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  function seedProjectWithNode(nodeId: string): void {
    const store = SqliteStore.open(dir)
    store.initProject('artifacts-test')
    const now = new Date().toISOString()
    store.insertNode({
      id: nodeId,
      type: 'task',
      title: nodeId,
      status: 'backlog',
      priority: 3,
      createdAt: now,
      updatedAt: now,
    })
    store.close()
  }

  it('add persists an artifact and get roundtrips it', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-artifacts-'))
    seedProjectWithNode('node_1')

    const added = await run([
      'add',
      'node_1',
      'epic_1',
      '--kind',
      'note',
      '--content',
      'a real decision note',
      '-d',
      dir,
    ])
    expect(added.ok).toBe(true)
    const id = (added.data as { id: string }).id
    expect(id.startsWith('artifact_')).toBe(true)

    const gotten = await run(['get', id, '-d', dir])
    expect(gotten.ok).toBe(true)
    expect((gotten.data as { content: string }).content).toBe('a real decision note')
    expect((gotten.data as { kind: string }).kind).toBe('note')
  })

  it('add rejects an invalid --kind', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-artifacts-badkind-'))
    seedProjectWithNode('node_1')

    const result = await run(['add', 'node_1', 'epic_1', '--kind', 'bogus', '--content', 'x', '-d', dir])
    expect(result.ok).toBe(false)
    expect(result.code).toBe('INVALID_INPUT')
  })

  it('add fails NOT_FOUND for an unknown nodeId', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-artifacts-nonode-'))
    const store = SqliteStore.open(dir)
    store.initProject('artifacts-test')
    store.close()

    const result = await run(['add', 'node_missing', 'epic_1', '--kind', 'note', '--content', 'x', '-d', dir])
    expect(result.ok).toBe(false)
    expect(result.code).toBe('NOT_FOUND')
  })

  it('list --node returns only artifacts for that node', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-artifacts-list-node-'))
    seedProjectWithNode('node_1')
    seedProjectWithNode('node_2')

    await run(['add', 'node_1', 'epic_1', '--kind', 'diff', '--content', 'diff a', '-d', dir])
    await run(['add', 'node_2', 'epic_1', '--kind', 'diff', '--content', 'diff b', '-d', dir])

    const listed = await run(['list', '--node', 'node_1', '-d', dir])
    expect(listed.ok).toBe(true)
    expect(listed.data as unknown[]).toHaveLength(1)
  })

  it('list --epic returns artifacts across nodes sharing the epic', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-artifacts-list-epic-'))
    seedProjectWithNode('node_1')
    seedProjectWithNode('node_2')

    await run(['add', 'node_1', 'epic_shared', '--kind', 'diff', '--content', 'diff a', '-d', dir])
    await run(['add', 'node_2', 'epic_shared', '--kind', 'decision', '--content', 'decision b', '-d', dir])

    const listed = await run(['list', '--epic', 'epic_shared', '-d', dir])
    expect(listed.ok).toBe(true)
    expect(listed.data as unknown[]).toHaveLength(2)
  })

  it('list without --node or --epic fails INVALID_INPUT', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-artifacts-list-bad-'))
    seedProjectWithNode('node_1')

    const result = await run(['list', '-d', dir])
    expect(result.ok).toBe(false)
    expect(result.code).toBe('INVALID_INPUT')
  })

  it('get returns NOT_FOUND for an unknown id', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-artifacts-get-missing-'))
    seedProjectWithNode('node_1')

    const result = await run(['get', 'nonexistent', '-d', dir])
    expect(result.ok).toBe(false)
    expect(result.code).toBe('NOT_FOUND')
  })
})
