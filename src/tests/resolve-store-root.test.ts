/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveStoreRoot } from '../core/store/resolve-store-root.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { writeMemory, readMemory } from '../core/memory/memory-reader.js'

// node_db03edaf7caa — worktree-por-formiga: N worktrees, UM grafo. AGF_GRAPH_ROOT
// redireciona graph.db + memórias para o root central; env ausente/blank =
// byte-idêntico ao atual (o worktree antigo quebrava exatamente porque o
// graph.db gitignored não viajava — o root central resolve isso).

describe('resolveStoreRoot (helper puro)', () => {
  const original = process.env.AGF_GRAPH_ROOT

  afterEach(() => {
    if (original === undefined) delete process.env.AGF_GRAPH_ROOT
    else process.env.AGF_GRAPH_ROOT = original
  })

  it('env ausente ⇒ devolve o dir intacto (byte-idêntico)', () => {
    delete process.env.AGF_GRAPH_ROOT
    expect(resolveStoreRoot('/algum/worktree')).toBe('/algum/worktree')
  })

  it('env blank ⇒ devolve o dir intacto', () => {
    process.env.AGF_GRAPH_ROOT = '   '
    expect(resolveStoreRoot('/algum/worktree')).toBe('/algum/worktree')
  })

  it('env setado ⇒ devolve o root central', () => {
    process.env.AGF_GRAPH_ROOT = '/central/repo'
    expect(resolveStoreRoot('/worktree-a')).toBe('/central/repo')
  })

  it(':memory: passa intacto mesmo com env setado (fixtures de teste não são redirecionadas)', () => {
    process.env.AGF_GRAPH_ROOT = '/central/repo'
    expect(resolveStoreRoot(':memory:')).toBe(':memory:')
  })
})

describe('AGF_GRAPH_ROOT — integração store + memórias', () => {
  const original = process.env.AGF_GRAPH_ROOT
  let central: string
  let worktree: string

  beforeEach(() => {
    central = mkdtempSync(join(tmpdir(), 'agf-central-'))
    worktree = mkdtempSync(join(tmpdir(), 'agf-worktree-'))
  })

  afterEach(() => {
    if (original === undefined) delete process.env.AGF_GRAPH_ROOT
    else process.env.AGF_GRAPH_ROOT = original
    rmSync(central, { recursive: true, force: true })
    rmSync(worktree, { recursive: true, force: true })
  })

  it('AC1: com env, abrir o store no worktree usa o graph.db do root central', () => {
    process.env.AGF_GRAPH_ROOT = central

    const store = SqliteStore.open(worktree)
    store.initProject('central-test')
    store.close()

    expect(existsSync(join(central, 'workflow-graph', 'graph.db'))).toBe(true)
    expect(existsSync(join(worktree, 'workflow-graph', 'graph.db'))).toBe(false)

    // Um segundo "worktree" enxerga o MESMO projeto (grafo único da colônia).
    const other = mkdtempSync(join(tmpdir(), 'agf-worktree-b-'))
    const store2 = SqliteStore.open(other)
    expect(store2.getProject()?.name).toBe('central-test')
    store2.close()
    rmSync(other, { recursive: true, force: true })
  })

  it('AC2: sem env, o caminho é o atual (dir/workflow-graph) — regressão zero', () => {
    delete process.env.AGF_GRAPH_ROOT

    const store = SqliteStore.open(worktree)
    store.initProject('local-test')
    store.close()

    expect(existsSync(join(worktree, 'workflow-graph', 'graph.db'))).toBe(true)
    expect(existsSync(join(central, 'workflow-graph', 'graph.db'))).toBe(false)
  })

  it('AC3: com env, writeMemory/readMemory no worktree vivem sob o root central', async () => {
    process.env.AGF_GRAPH_ROOT = central

    await writeMemory(worktree, 'licao-colonia', 'trilha compartilhada da colônia')

    expect(existsSync(join(central, 'workflow-graph', 'memories', 'licao-colonia.md'))).toBe(true)
    expect(existsSync(join(worktree, 'workflow-graph'))).toBe(false)
    const mem = await readMemory(worktree, 'licao-colonia')
    expect(mem?.content).toBe('trilha compartilhada da colônia')
  })
})
