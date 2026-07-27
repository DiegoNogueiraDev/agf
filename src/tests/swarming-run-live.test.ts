/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes do node_c88541cf4a2d (Swarm-B) — `ant-swarming run` executa LIVE
 * (runColony async + makeLlm) quando um provider está disponível, e devolve o
 * envelope mode:delegated BYTE-IDÊNTICO ao atual quando ausente. Caminho async
 * que lança degrada para delegated, nunca crash. Seams injetáveis (detect/
 * colony/llmFactory) — o LLM real nunca é chamado no teste (stub do brief).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { executeRunCommand } from '../swarming/program.js'
import type { RunColonyResult } from '../swarming/run.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function freshStore(): SqliteStore {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('proj-run-live')
  return store
}

function addTask(store: SqliteStore, id: string): void {
  const now = new Date().toISOString()
  store.insertNode({
    id,
    type: 'task',
    title: `Task ${id}`,
    status: 'backlog',
    priority: 3,
    acceptanceCriteria: ['Given X, When Y, Then Z'],
    tags: [],
    createdAt: now,
    updatedAt: now,
  } as GraphNode)
}

const COLONY_RESULT: RunColonyResult = {
  tasksClosed: 1,
  tasksBlocked: 0,
  rounds: 1,
  reclaimed: 0,
  perTaskCost: [{ nodeId: 'node_t1', tokens: 15, costUsd: 0 }],
}

let store: SqliteStore

beforeEach(() => {
  store = freshStore()
  addTask(store, 'node_t1')
})

afterEach(() => {
  store.close()
})

describe('executeRunCommand', () => {
  it('provider available → mode live, runColony async chamado com ants/budget wired (AC1)', async () => {
    let received: { ants: number } | null = null
    const out = await executeRunCommand({
      store,
      ants: 3,
      budgetTokens: 1000,
      detect: () => ({ available: true, via: 'provider-key', detail: 'openrouter' }),
      colony: async (deps) => {
        received = { ants: deps.ants }
        return COLONY_RESULT
      },
      llmFactory: () => ({
        async run() {
          return { text: '{}', inputTokens: 1, outputTokens: 1 }
        },
      }),
    })

    expect(out.mode).toBe('live')
    expect(received).toEqual({ ants: 3 })
    expect((out as { result?: RunColonyResult }).result?.tasksClosed).toBe(1)
  })

  it('provider AUSENTE → delegated deep-equal ao shape atual (AC2, byte-idêntico)', async () => {
    const out = await executeRunCommand({
      store,
      ants: 2,
      budgetTokens: 0,
      detect: () => ({ available: false, via: 'none' }),
      colony: async () => {
        throw new Error('não deve ser chamado sem provider')
      },
    })

    expect(out).toEqual({
      mode: 'delegated',
      reason: 'Nenhum provider conectado — delegando à CLI-agente que dirige (modo any-CLI).',
      provider: { available: false, via: 'none' },
      colony: { hasQueue: true, ants: 2, budgetTokens: 0 },
      nextSteps: [
        'Conecte um provider (ant-swarming providers use <id>) OU dirija a colônia com seu próprio LLM.',
        'Feche cada task pelo fluxo do agf: agf next → agf brief <id> → agf submit <id> --result <json>.',
      ],
    })
  })

  it('caminho async lança (caso de erro) → degrada para delegated com o erro, sem crash (AC3)', async () => {
    const out = await executeRunCommand({
      store,
      ants: 2,
      budgetTokens: 0,
      detect: () => ({ available: true, via: 'provider-key', detail: 'openrouter' }),
      colony: async () => {
        throw new Error('gateway exploded')
      },
    })

    expect(out.mode).toBe('delegated')
    expect(out.reason).toContain('gateway exploded')
    expect((out as { colony: { hasQueue: boolean } }).colony.hasQueue).toBe(true)
  })
})
