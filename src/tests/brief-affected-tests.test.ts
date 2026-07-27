/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes dos testes-afetados no brief (F3.T2 — node_91f104190c01).
 * TDAD (arXiv 2603.17973): dar ao executor o mapa de testes afetados ANTES da
 * mudança reduz regressão. O brief deriva, dos implementationFiles do node, os
 * arquivos src/tests/<stem>.test.ts a verificar — determinístico, zero LLM.
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'
import { deriveAffectedTests, buildExecutorBrief } from '../core/context/executor-brief.js'

describe('deriveAffectedTests (puro, stem→test)', () => {
  it('AC1: implementationFiles => src/tests/<stem>.test.ts correspondente', () => {
    const affected = deriveAffectedTests(['src/core/economy/savings-tracker.ts'])
    expect(affected).toEqual(['src/tests/savings-tracker.test.ts'])
  })

  it('AC3: mesmo input duas vezes => lista identica (determinismo + dedup ordenado)', () => {
    const input = ['src/core/a/foo.ts', 'src/core/b/foo.ts', 'src/cli/bar.ts']
    const a = deriveAffectedTests(input)
    const b = deriveAffectedTests(input)
    expect(a).toEqual(b)
    // foo aparece 2x mas o stem colapsa p/ um unico test file
    expect(a).toEqual(['src/tests/bar.test.ts', 'src/tests/foo.test.ts'])
  })

  it('AC2: lista vazia => vazia sem erro', () => {
    expect(deriveAffectedTests([])).toEqual([])
    expect(deriveAffectedTests(undefined)).toEqual([])
  })

  it('ignora arquivos que ja sao *.test.ts (evita self-reference)', () => {
    expect(deriveAffectedTests(['src/tests/x.test.ts', 'src/core/y.ts'])).toEqual(['src/tests/y.test.ts'])
  })
})

describe('buildExecutorBrief.affectedTests (F3.T2)', () => {
  function storeWithNode(node: Partial<GraphNode>): SqliteStore {
    const store = SqliteStore.open(':memory:')
    store.initProject('brief-affected-test')
    const now = new Date().toISOString()
    store.insertNode({
      id: 'task-af',
      type: 'task',
      title: 'Task com arquivos',
      status: 'backlog',
      priority: 2,
      acceptanceCriteria: ['ac'],
      createdAt: now,
      updatedAt: now,
      ...node,
    } as GraphNode)
    return store
  }

  it('AC1: brief de task com implementationFiles lista o test file correspondente', () => {
    const store = storeWithNode({ implementationFiles: ['src/core/economy/savings-tracker.ts'] })
    const brief = buildExecutorBrief(store, 'task-af')
    expect(brief!.affectedTests).toEqual(['src/tests/savings-tracker.test.ts'])
    store.close()
  })

  it('AC2: task sem implementationFiles => campo omitido, resto do brief intacto', () => {
    const store = storeWithNode({})
    const brief = buildExecutorBrief(store, 'task-af')
    expect(brief!.affectedTests).toBeUndefined()
    expect(brief!.intent).toBeDefined()
    store.close()
  })
})
