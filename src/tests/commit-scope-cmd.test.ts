/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes do agf commit-scope (node_fd2cc3209ef6) — commit por pathspec dos
 * arquivos DECLARADOS do node, imune a staged alheio no index (a areia movediça
 * de um working tree compartilhado entre formigas). Git real em tmpdir.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { commitScopeCommand } from '../cli/commands/commit-scope-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function git(dir: string, ...args: string[]): string {
  // GIT_DIR/GIT_INDEX_FILE vazam quando o teste roda DENTRO de um hook git
  // (pre-commit chama o blast) e apontariam o git do tmpdir pro repo pai.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
  return execFileSync('git', args, { cwd: dir, encoding: 'utf-8', env }).trim()
}

async function run(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: unknown) => {
    out.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  try {
    await commitScopeCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('agf commit-scope — pathspec dos arquivos declarados', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-commit-scope-'))
    git(dir, 'init', '-q')
    git(dir, 'config', 'user.email', 'test@test.dev')
    git(dir, 'config', 'user.name', 'Test')
    writeFileSync(join(dir, 'base.ts'), 'export const base = 1\n')
    git(dir, 'add', 'base.ts')
    git(dir, 'commit', '-q', '-m', 'base')
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  function seedNode(id: string, impl?: string[], test?: string[]): void {
    const store = SqliteStore.open(dir)
    store.initProject('commit-scope-test')
    const now = new Date().toISOString()
    store.insertNode({
      id,
      type: 'task',
      title: `Task ${id}`,
      status: 'in_progress',
      priority: 2,
      createdAt: now,
      updatedAt: now,
      ...(impl ? { implementationFiles: impl } : {}),
      ...(test ? { testFiles: test } : {}),
    } as GraphNode)
    store.close()
  }

  it('AC1: commita EXATAMENTE os declarados e preserva o staged alheio no index', async () => {
    // Arrange — declarados (2 novos) e um staged ALHEIO.
    seedNode('t1', ['src/meu.ts'], ['src/tests/meu.test.ts'])
    mkdirSync(join(dir, 'src/tests'), { recursive: true })
    writeFileSync(join(dir, 'src/meu.ts'), 'export const meu = 1\n')
    writeFileSync(join(dir, 'src/tests/meu.test.ts'), 'export const t = 1\n')
    writeFileSync(join(dir, 'alheio.ts'), 'export const alheio = 1\n')
    git(dir, 'add', 'alheio.ts')

    // Act
    const result = await run(['t1', '-m', 'feat(core): escopo do t1', '-d', dir])

    // Assert — envelope + conteúdo exato do commit + staged alheio intacto.
    expect(result.ok).toBe(true)
    const shown = git(dir, 'show', '--stat', '--name-only', '--format=', 'HEAD').split('\n').filter(Boolean)
    expect(new Set(shown)).toEqual(new Set(['src/meu.ts', 'src/tests/meu.test.ts']))
    const staged = git(dir, 'diff', '--cached', '--name-only')
    expect(staged).toBe('alheio.ts')
  })

  it('AC2: node sem arquivos declarados → NO_DECLARED_FILES e nenhum commit criado', async () => {
    seedNode('t2')
    const before = git(dir, 'rev-parse', 'HEAD')

    const result = await run(['t2', '-m', 'msg', '-d', dir])

    expect(result.ok).toBe(false)
    expect(result.code).toBe('NO_DECLARED_FILES')
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(before)
  })

  it('AC3: arquivo declarado inexistente no disco → falha nomeando o path e nenhum commit', async () => {
    seedNode('t3', ['src/fantasma.ts'])
    const before = git(dir, 'rev-parse', 'HEAD')

    const result = await run(['t3', '-m', 'msg', '-d', dir])

    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).toContain('src/fantasma.ts')
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(before)
  })

  it('node inexistente → NOT_FOUND', async () => {
    seedNode('t4', ['src/x.ts'])
    const result = await run(['nao-existe', '-m', 'msg', '-d', dir])
    expect(result.ok).toBe(false)
    expect(result.code).toBe('NOT_FOUND')
  })
})
