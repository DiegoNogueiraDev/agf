/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { RealTaskLifecycleService } from '../core/services/task-lifecycle.js'
import type { GraphNode, NodeStatus } from '../core/graph/graph-types.js'

// node_8af0904e42fa — claimedBy é gravado no claim mas nunca era removido: após
// done/blocked/quarantined o dono morto assombrava o re-open (FOREIGN_WIP eterno
// sem --force). A limpeza vive na autoridade única de transição
// (node-mutations.updateNodeStatus), então TODOS os caminhos (agf done, service,
// node status) saem de in_progress sem dono fantasma.

function makeStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('claimedby-clear-test')
  return store
}

function seedTask(store: SqliteStore, id: string, status: NodeStatus, metadata?: Record<string, unknown>): void {
  const now = new Date().toISOString()
  store.insertNode({
    id,
    type: 'task',
    title: `Task ${id}`,
    status,
    priority: 2,
    createdAt: now,
    updatedAt: now,
    ...(metadata ? { metadata } : {}),
  } as GraphNode)
}

function metadataOf(store: SqliteStore, id: string): Record<string, unknown> | undefined {
  return store.getNodeById(id)?.metadata as Record<string, unknown> | undefined
}

describe('updateNodeStatus — limpa claimedBy ao SAIR de in_progress (node_8af0904e42fa)', () => {
  it('AC1: in_progress com claimedBy → done ⇒ claimedBy removido, demais chaves preservadas', () => {
    const store = makeStore()
    seedTask(store, 't1', 'in_progress', { claimedBy: 'formiga-a', origin: 'imported' })

    store.updateNodeStatus('t1', 'done')

    const meta = metadataOf(store, 't1')
    expect(meta?.claimedBy).toBeUndefined()
    expect(meta?.origin).toBe('imported') // merge imutável: só a chave do dono sai
    store.close()
  })

  it('AC2: in_progress com claimedBy → blocked ⇒ dono removido; re-claim por outra formiga passa', () => {
    const store = makeStore()
    seedTask(store, 't2', 'in_progress', { claimedBy: 'formiga-a' })

    store.updateNodeStatus('t2', 'blocked')
    expect(metadataOf(store, 't2')?.claimedBy).toBeUndefined()

    // re-open direto no store: formiga-b assume sem fantasma de formiga-a
    store.updateNodeStatus('t2', 'in_progress')
    store.updateNode('t2', { metadata: { ...(metadataOf(store, 't2') ?? {}), claimedBy: 'formiga-b' } })
    expect(metadataOf(store, 't2')?.claimedBy).toBe('formiga-b')
    store.close()
  })

  it('AC3: sem claimedBy ⇒ metadata byte-idêntico em qualquer transição (sem chave fantasma)', () => {
    const store = makeStore()
    seedTask(store, 't3', 'in_progress', { origin: 'cli' })
    seedTask(store, 't4', 'in_progress') // metadata ausente

    store.updateNodeStatus('t3', 'done')
    store.updateNodeStatus('t4', 'done')

    expect(metadataOf(store, 't3')).toEqual({ origin: 'cli' })
    expect(metadataOf(store, 't4')?.claimedBy).toBeUndefined()
    store.close()
  })

  it('transição que NÃO sai de in_progress preserva o dono (backlog→ready, in_progress→in_progress)', () => {
    const store = makeStore()
    seedTask(store, 't5', 'in_progress', { claimedBy: 'formiga-a' })

    store.updateNodeStatus('t5', 'in_progress') // idempotente: dono fica

    expect(metadataOf(store, 't5')?.claimedBy).toBe('formiga-a')
    store.close()
  })

  it('caminho do service (RealTaskLifecycleService.updateStatus) também limpa o dono', () => {
    const store = makeStore()
    seedTask(store, 't6', 'in_progress', { claimedBy: 'formiga-a' })

    new RealTaskLifecycleService(store).updateStatus('t6', 'done')

    expect(metadataOf(store, 't6')?.claimedBy).toBeUndefined()
    store.close()
  })
})

// node_0c28154d4517 — claimedBy gravado no PULL (next --agent) sobre task que
// nunca entrou em in_progress assombrava para sempre: o strip original só
// disparava saindo de in_progress. Semântica correta: o dono durável é o par
// (in_progress + claimedBy); qualquer transição que NÃO entra em in_progress
// limpa o dono — quem entra em in_progress regrava na hora (next/node status).
describe('updateNodeStatus — dono de pull órfão não assombra (node_0c28154d4517)', () => {
  it('backlog com claimedBy de pull → ready ⇒ dono removido', () => {
    const store = makeStore()
    seedTask(store, 'p1', 'backlog', { claimedBy: 'formiga-a', origin: 'imported' })

    store.updateNodeStatus('p1', 'ready')

    const meta = metadataOf(store, 'p1')
    expect(meta?.claimedBy).toBeUndefined()
    expect(meta?.origin).toBe('imported')
    store.close()
  })

  it('transição PARA in_progress preserva o dono (o claimante regrava em seguida)', () => {
    const store = makeStore()
    seedTask(store, 'p2', 'backlog', { claimedBy: 'formiga-a' })

    store.updateNodeStatus('p2', 'in_progress')

    expect(metadataOf(store, 'p2')?.claimedBy).toBe('formiga-a')
    store.close()
  })
})
