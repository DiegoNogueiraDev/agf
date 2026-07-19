/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_22d90626e705 — os gates de `agf done` se contradiziam. NO_FILES_MODIFIED
 * exigia árvore SUJA (algo modificado vs HEAD), enquanto surgical-scope/BLAST_RADIUS
 * exigia árvore RESTRITA — uma entrega JÁ COMMITADA (árvore limpa) só fechava com
 * --force (que também pula os testes). Fix: uma árvore limpa NÃO é "nada feito" quando
 * o node declara impl+test que EXISTEM no disco (a mesma triangulação física do gate
 * PHANTOM_TESTFILE) — evidência mais forte que uma árvore suja arbitrária.
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

describe('agf done — entrega já commitada fecha por triangulação (node_22d90626e705)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-committed-tri-'))
    execSync('git init -q', { cwd: dir })
    execSync('git config user.email test@test.com', { cwd: dir })
    execSync('git config user.name test', { cwd: dir })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
    writeFileSync(join(dir, '.gitignore'), 'workflow-graph/\n')
    mkdirSync(join(dir, 'src'), { recursive: true })
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

  it('fecha SEM --force uma entrega commitada (árvore limpa) com impl+test no disco', async () => {
    writeFileSync(join(dir, 'src/a.ts'), 'export const a = 1\n')
    writeFileSync(join(dir, 'src/a.test.ts'), 'export const t = 1\n')
    execSync('git add -A && git commit -q -m "entrega já commitada"', { cwd: dir })

    const store = SqliteStore.open(dir)
    store.initProject('committed-tri')
    addNode(store, { id: 'node_1', implementationFiles: ['src/a.ts'], testFiles: ['src/a.test.ts'] })
    store.close()

    // Árvore LIMPA (nada modificado vs HEAD) — antes: NO_FILES_MODIFIED.
    const envelope = await runDone('node_1', dir)
    expect(envelope.ok).toBe(true)
  })

  it('AINDA recusa (NO_FILES_MODIFIED) quando a árvore está limpa e o node NÃO declara impl+test', async () => {
    writeFileSync(join(dir, 'src/b.ts'), 'export const b = 1\n')
    execSync('git add -A && git commit -q -m baseline', { cwd: dir })

    const store = SqliteStore.open(dir)
    store.initProject('committed-tri')
    // Só implementationFiles, sem testFiles → não há como triangular → fallback honesto.
    addNode(store, { id: 'node_2', implementationFiles: ['src/b.ts'] })
    store.close()

    const envelope = await runDone('node_2', dir)
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('NO_FILES_MODIFIED')
  })

  it('AINDA recusa quando a árvore está limpa e um arquivo declarado NÃO existe no disco (PHANTOM)', async () => {
    writeFileSync(join(dir, 'src/c.ts'), 'export const c = 1\n')
    execSync('git add -A && git commit -q -m baseline', { cwd: dir })

    const store = SqliteStore.open(dir)
    store.initProject('committed-tri')
    addNode(store, {
      id: 'node_3',
      implementationFiles: ['src/c.ts'],
      testFiles: ['src/c.test.ts'], // não existe no disco
    })
    store.close()

    const envelope = await runDone('node_3', dir)
    expect(envelope.ok).toBe(false)
    // Triangulação falha (test file ausente) → não passa pelo atalho de commitado.
    expect(['NO_FILES_MODIFIED', 'PHANTOM_TESTFILE']).toContain(envelope.code)
  })
})
