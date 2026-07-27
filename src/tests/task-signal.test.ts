/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes do TaskSignal (E2.T1 — node_86df3221cf87).
 * O sinal da task ativa (keywords de título+AC do node in_progress) alimenta a
 * poda task-aware do compress run; sem task ativa o sinal é null (estágio no-op).
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'
import { extractTaskSignal } from '../core/context/task-signal.js'

function openStoreWithProject(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('task-signal-test')
  return store
}

function insertTask(store: SqliteStore, id: string, status: string, title: string, ac: string[]): void {
  const now = new Date().toISOString()
  store.insertNode({
    id,
    type: 'task',
    title,
    status,
    priority: 2,
    acceptanceCriteria: ac,
    createdAt: now,
    updatedAt: now,
  } as GraphNode)
}

describe('extractTaskSignal', () => {
  it('AC1: node in_progress com 3 ACs gera >=5 keywords unicas de titulo+AC e taskId correto', () => {
    // Arrange
    const store = openStoreWithProject()
    insertTask(store, 'task-sig', 'in_progress', 'Implementar compressao do ledger economico', [
      'Given o ledger com linhas, When comprimo a saida, Then a reducao supera trinta porcento',
      'Given fixture do vitest, When aplico a poda, Then os arquivos citados permanecem',
      'Given sinal nulo, When o estagio roda, Then bytes identicos',
    ])

    // Act
    const signal = extractTaskSignal(store)

    // Assert
    expect(signal).not.toBeNull()
    expect(signal!.taskId).toBe('task-sig')
    expect(new Set(signal!.keywords).size).toBe(signal!.keywords.length)
    expect(signal!.keywords.length).toBeGreaterThanOrEqual(5)
    expect(signal!.acLines.length).toBe(3)
    store.close()
  })

  it('AC2: nenhum node in_progress retorna null sem excecao', () => {
    const store = openStoreWithProject()
    insertTask(store, 'task-b', 'backlog', 'Task parada', ['ac'])
    expect(extractTaskSignal(store)).toBeNull()
    store.close()
  })

  it('AC3: stopwords PT/EN nao aparecem nas keywords', () => {
    // Arrange
    const store = openStoreWithProject()
    insertTask(store, 'task-stop', 'in_progress', 'Quando o sistema deve fazer a coisa certa', [
      'Given that the system should work, When para todos os casos, Then funciona sempre',
    ])

    // Act
    const signal = extractTaskSignal(store)

    // Assert — nenhuma stopword clássica PT/EN presente
    const banned = ['quando', 'deve', 'para', 'that', 'the', 'should', 'when', 'then', 'given']
    for (const w of banned) {
      expect(signal!.keywords).not.toContain(w)
    }
    store.close()
  })

  it('dois nodes in_progress (ambiguidade) retorna null — nunca adivinhar', () => {
    const store = openStoreWithProject()
    insertTask(store, 'task-x', 'in_progress', 'Primeira tarefa ativa', ['ac um'])
    insertTask(store, 'task-y', 'in_progress', 'Segunda tarefa ativa', ['ac dois'])
    expect(extractTaskSignal(store)).toBeNull()
    store.close()
  })
})
