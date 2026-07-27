/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/permissions-cmd.ts — wires PermissionStore
 * (node_wire_71f24d2a56c2), which had zero real callers despite operating
 * on a real permissions table.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { permissionsCommand } from '../cli/commands/permissions-cmd.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function run(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: unknown) => {
    out.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  try {
    await permissionsCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return lastEnvelope(out)
}

describe('agf permissions (node_wire_71f24d2a56c2)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('set → list round-trips a permission rule', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-perm-'))
    const store = SqliteStore.open(dir)
    store.initProject('perm-test')
    store.close()

    const setResult = await run([
      'set',
      '--project',
      'proj-1',
      '--action',
      'bash',
      '--resource',
      'rm -rf *',
      '--effect',
      'deny',
      '-d',
      dir,
    ])
    expect(setResult.ok).toBe(true)

    const listed = await run(['list', '--project', 'proj-1', '-d', dir])
    expect(listed.ok).toBe(true)
    const rows = (listed.data as { rules: Array<{ action: string; resource: string; effect: string }> }).rules
    expect(rows).toEqual([{ action: 'bash', resource: 'rm -rf *', effect: 'deny' }])
  })

  it('check reports false for a rule that was never set', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-perm-'))
    const store = SqliteStore.open(dir)
    store.initProject('perm-test')
    store.close()

    const checked = await run(['check', '--project', 'proj-1', '--action', 'bash', '--resource', 'ls', '-d', dir])
    expect(checked.ok).toBe(true)
    expect((checked.data as { allowed: boolean }).allowed).toBe(false)
  })

  it('check resolves a glob resource pattern via cascading ruleset evaluation', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-perm-'))
    const store = SqliteStore.open(dir)
    store.initProject('perm-test')
    store.close()

    await run([
      'set',
      '--project',
      'proj-1',
      '--action',
      'read',
      '--resource',
      'file:src/**/*.ts',
      '--effect',
      'allow',
      '-d',
      dir,
    ])

    const checked = await run([
      'check',
      '--project',
      'proj-1',
      '--action',
      'read',
      '--resource',
      'file:src/core/test.ts',
      '-d',
      dir,
    ])
    expect(checked.ok).toBe(true)
    expect((checked.data as { allowed: boolean; effect: string }).effect).toBe('allow')
    expect((checked.data as { allowed: boolean; effect: string }).allowed).toBe(true)
  })

  it('check applies last-match-wins cascade — a later deny overrides an earlier allow', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-perm-'))
    const store = SqliteStore.open(dir)
    store.initProject('perm-test')
    store.close()

    await run([
      'set',
      '--project',
      'proj-1',
      '--action',
      'write',
      '--resource',
      'file:*',
      '--effect',
      'allow',
      '-d',
      dir,
    ])
    await run([
      'set',
      '--project',
      'proj-1',
      '--action',
      'write',
      '--resource',
      'file:secret/*',
      '--effect',
      'deny',
      '-d',
      dir,
    ])

    const checked = await run([
      'check',
      '--project',
      'proj-1',
      '--action',
      'write',
      '--resource',
      'file:secret/x.txt',
      '-d',
      dir,
    ])
    expect((checked.data as { effect: string }).effect).toBe('deny')
  })

  it('delete removes a previously set rule', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-perm-'))
    const store = SqliteStore.open(dir)
    store.initProject('perm-test')
    store.close()

    await run(['set', '--project', 'proj-1', '--action', 'bash', '--resource', 'ls', '--effect', 'allow', '-d', dir])
    const deleted = await run(['delete', '--project', 'proj-1', '--action', 'bash', '--resource', 'ls', '-d', dir])
    expect(deleted.ok).toBe(true)

    const listed = await run(['list', '--project', 'proj-1', '-d', dir])
    expect((listed.data as { rules: unknown[] }).rules).toEqual([])
  })

  it('rejects an invalid --effect value', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-perm-'))
    const store = SqliteStore.open(dir)
    store.initProject('perm-test')
    store.close()

    const result = await run([
      'set',
      '--project',
      'proj-1',
      '--action',
      'bash',
      '--resource',
      'ls',
      '--effect',
      'maybe',
      '-d',
      dir,
    ])
    expect(result.ok).toBe(false)
    expect(result.code).toBe('INVALID_EFFECT')
  })
})
