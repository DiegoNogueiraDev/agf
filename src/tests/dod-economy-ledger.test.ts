/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * DoD check #10 (economy_awareness) is ledger-aware + trigger-based: it only
 * flags waste when the task actually spent LLM tokens with no economy lever.
 * Delegate-first tasks (0 LLM calls) and cache-covered tasks pass.
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { recordModelCall } from '../core/observability/llm-call-ledger.js'
import { checkDefinitionOfDone } from '../core/implementer/definition-of-done.js'
import type { GraphDocument, GraphNode } from '../schemas/entity.schema.js'

function freshStore(): SqliteStore {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('proj-dod-economy')
  return store
}

function docWith(node: Partial<GraphNode> & { id: string }): GraphDocument {
  const ts = new Date().toISOString()
  const full: GraphNode = {
    id: node.id,
    type: 'task',
    title: 'T',
    status: 'in_progress',
    priority: 3,
    createdAt: ts,
    updatedAt: ts,
    ...node,
  }
  return { nodes: [full], edges: [] }
}

function economyCheck(store: SqliteStore, doc: GraphDocument, id: string) {
  const report = checkDefinitionOfDone(doc, id, { db: store.getDb() })
  return report.checks.find((c) => c.name === 'economy_awareness')!
}

describe('DoD economy_awareness (ledger-aware)', () => {
  it('FAILS when the task spent LLM tokens with no cache/economy lever', () => {
    const store = freshStore()
    recordModelCall(store.getDb(), {
      provider: 'anthropic',
      model: 'claude-opus-4-8',
      inputTokens: 5000,
      outputTokens: 1200,
      nodeId: 'node_spend',
    })
    const check = economyCheck(store, docWith({ id: 'node_spend' }), 'node_spend')
    expect(check.passed).toBe(false)
    expect(check.details).toMatch(/sem nenhuma lever|rotear via agf/i)
  })

  it('PASSES a delegate-first task with 0 LLM calls (nothing to optimize)', () => {
    const store = freshStore()
    const check = economyCheck(store, docWith({ id: 'node_delegate' }), 'node_delegate')
    expect(check.passed).toBe(true)
    expect(check.details).toMatch(/delegate-first|nada a otimizar/i)
  })

  it('PASSES when the task used the prefix cache', () => {
    const store = freshStore()
    recordModelCall(store.getDb(), {
      provider: 'anthropic',
      model: 'claude-opus-4-8',
      inputTokens: 5000,
      outputTokens: 1200,
      cachedInputTokens: 3000,
      nodeId: 'node_cache',
    })
    const check = economyCheck(store, docWith({ id: 'node_cache' }), 'node_cache')
    expect(check.passed).toBe(true)
    expect(check.details).toMatch(/cache cobriu/i)
  })

  it('PASSES when economyFlags are present even with spend', () => {
    const store = freshStore()
    recordModelCall(store.getDb(), {
      provider: 'anthropic',
      model: 'claude-opus-4-8',
      inputTokens: 5000,
      outputTokens: 1200,
      nodeId: 'node_flags',
    })
    const check = economyCheck(
      store,
      docWith({ id: 'node_flags', metadata: { economyFlags: { select: true } } }),
      'node_flags',
    )
    expect(check.passed).toBe(true)
  })
})
