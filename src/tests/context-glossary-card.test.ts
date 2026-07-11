/*!
 * TDD: glossary card injected into context-pack (node_d8a449429871).
 *
 * AC1: default context includes a glossary card within token budget.
 * AC2: with full=true the glossary card is omitted.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../schemas/entity.schema.js'
import { buildCompressedContext } from '../core/context/compressed-context-builder.js'

function makeStoreWithTask(): { store: SqliteStore; nodeId: string } {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('test-glossary')
  const ts = new Date().toISOString()
  const nodeId = 'node_glossary_test_001'
  const node: GraphNode = {
    id: nodeId,
    type: 'task',
    title: 'Test task for glossary injection',
    status: 'backlog',
    priority: 3,
    createdAt: ts,
    updatedAt: ts,
    description:
      'This task implements the compact-context pipeline with glossary builder. The context-pack includes domain terms from task-context-builder and compressed-context-builder modules.',
    acceptanceCriteria: ['Given a task, When context built, Then glossary card present'],
  }
  store.insertNode(node)
  return { store, nodeId }
}

describe('AC1: glossary card present by default', () => {
  let store: SqliteStore
  let nodeId: string

  beforeEach(() => {
    ;({ store, nodeId } = makeStoreWithTask())
  })

  it('payload includes glossary key', () => {
    const ctx = buildCompressedContext(store, nodeId)
    expect(ctx).not.toBeNull()
    const glossary = (ctx!.payload as Record<string, unknown>)['glossary']
    expect(glossary).toBeDefined()
  })
})

describe('AC2: glossary card omitted with full=true', () => {
  it('payload does not include glossary when full=true', () => {
    const { store, nodeId } = makeStoreWithTask()
    const ctx = buildCompressedContext(store, nodeId, { full: true })
    expect(ctx).not.toBeNull()
    const glossary = (ctx!.payload as Record<string, unknown>)['glossary']
    expect(glossary).toBeUndefined()
  })
})
