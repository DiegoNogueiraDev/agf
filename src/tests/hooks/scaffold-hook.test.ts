/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../../core/store/sqlite-store.js'
import { emitTaskHook, flushHooks } from '../../core/hooks/hook-runtime.js'
import { listGeneratedArtifacts } from '../../core/scaffolder/couple.js'
import { resolveReuse } from '../../core/reuse/resolve-reuse.js'

function seedScaffoldNode(store: SqliteStore, id: string): void {
  const now = new Date().toISOString()
  store.insertNode({
    id,
    type: 'task',
    title: 'Order lifecycle state machine',
    description: 'reducer with transitions',
    status: 'backlog',
    priority: 3,
    xpSize: 'S',
    parentId: null,
    acceptanceCriteria: [],
    tags: ['state-machine'],
    createdAt: now,
    updatedAt: now,
    metadata: {
      scaffold: {
        kind: 'state-machine',
        spec: {
          id,
          name: 'OrderLifecycle',
          states: ['pending', 'done'],
          transitions: [{ event: 'finish', from: 'pending', to: 'done' }],
        },
      },
    },
  } as never)
}

describe('scaffold:requested hook — geração determinística async', () => {
  let dir: string
  let store: SqliteStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-scf-'))
    store = SqliteStore.open(':memory:')
    store.initProject('test-project')
    delete process.env.AGF_HOOKS
  })

  afterEach(() => {
    store.close()
    rmSync(dir, { recursive: true, force: true })
    delete process.env.AGF_HOOKS
  })

  it('emit + flush gera arquivos, proveniência e cache (0 LLM)', async () => {
    seedScaffoldNode(store, 'n1')
    await emitTaskHook(store, 'scaffold:requested', { nodeId: 'n1', apply: true, workspaceDir: dir })
    await flushHooks(store)

    const arts = listGeneratedArtifacts(store)
    expect(arts.length).toBe(1)
    expect(arts[0].kinds).toContain('state-machine')
    // arquivos no disco
    for (const p of arts[0].paths) expect(existsSync(join(dir, p))).toBe(true)
    // reuso determinístico: a próxima vez é 'exact'
    const reuse = resolveReuse(store.getDb(), `scf_n1_state-machine`)
    expect(reuse.kind).toBe('exact')
  })

  it('kill-switch AGF_HOOKS=0 → no-op (nada gerado)', async () => {
    process.env.AGF_HOOKS = '0'
    seedScaffoldNode(store, 'n2')
    await emitTaskHook(store, 'scaffold:requested', { nodeId: 'n2', apply: true, workspaceDir: dir })
    await flushHooks(store)
    expect(listGeneratedArtifacts(store).length).toBe(0)
  })

  it('dry-run (apply:false) não escreve nem persiste', async () => {
    seedScaffoldNode(store, 'n3')
    await emitTaskHook(store, 'scaffold:requested', { nodeId: 'n3', apply: false, workspaceDir: dir })
    await flushHooks(store)
    expect(listGeneratedArtifacts(store).length).toBe(0)
  })
})
