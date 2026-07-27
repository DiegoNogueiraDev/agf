/*!
 * TDD: surface context scorecard in agf metrics --select data.context (node_a9b58ab9ac5a).
 *
 * AC: Given 'agf metrics --select data.context', when it runs, then tokens-vs-resolve fields are emitted.
 */

import { describe, it, expect } from 'vitest'
import { buildContextScorecard } from '../core/observability/context-scorecard.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { recordModelCall } from '../core/observability/llm-call-ledger.js'
import type { GraphNode } from '../core/graph/graph-types.js'
import { generateId } from '../core/utils/id.js'

function makeStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('Test')
  return store
}

function insertNode(store: SqliteStore, status: GraphNode['status']): string {
  const id = generateId('node')
  store.insertNode({
    id,
    type: 'task',
    title: `Task ${id}`,
    status,
    priority: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  return id
}

describe('metrics --select data.context scorecard', () => {
  it('buildContextScorecard returns tokens-vs-resolve fields', () => {
    const store = makeStore()
    const db = store.getDb()

    const n1 = insertNode(store, 'done')
    const n2 = insertNode(store, 'backlog')

    recordModelCall(db, {
      sessionId: 's1',
      nodeId: n1,
      provider: 'test',
      model: 'test',
      inputTokens: 200,
      outputTokens: 50,
      caller: 'test',
    })
    recordModelCall(db, {
      sessionId: 's1',
      nodeId: n2,
      provider: 'test',
      model: 'test',
      inputTokens: 300,
      outputTokens: 80,
      caller: 'test',
    })

    const scorecard = buildContextScorecard(db)

    expect(typeof scorecard.resolveRate).toBe('number')
    expect(typeof scorecard.avgTokensResolved).toBe('number')
    expect(typeof scorecard.avgTokensFailed).toBe('number')
    expect(scorecard.resolveRate).toBeGreaterThanOrEqual(0)
    store.close()
  })

  it('resolveRate is 1.0 when all tracked nodes are done', () => {
    const store = makeStore()
    const db = store.getDb()
    const n1 = insertNode(store, 'done')

    recordModelCall(db, {
      sessionId: 's1',
      nodeId: n1,
      provider: 'test',
      model: 'test',
      inputTokens: 100,
      outputTokens: 20,
      caller: 'test',
    })

    const scorecard = buildContextScorecard(db)
    expect(scorecard.resolveRate).toBe(1.0)
    store.close()
  })

  it('resolveRate is 0 when no tracked nodes are done', () => {
    const store = makeStore()
    const db = store.getDb()
    const n1 = insertNode(store, 'backlog')

    recordModelCall(db, {
      sessionId: 's1',
      nodeId: n1,
      provider: 'test',
      model: 'test',
      inputTokens: 100,
      outputTokens: 20,
      caller: 'test',
    })

    const scorecard = buildContextScorecard(db)
    expect(scorecard.resolveRate).toBe(0)
    store.close()
  })
})
