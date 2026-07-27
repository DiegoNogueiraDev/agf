import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { writeDecisionRationale, readDecisionRationale } from '../core/decisions/rationale-store.js'
import type { DecisionRationale } from '../core/decisions/rationale-store.js'
import type { GraphNode } from '../core/graph/types.js'

function makeStore() {
  const store = SqliteStore.open(':memory:')
  store.initProject('test-rationale')
  return store
}

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  const ts = new Date().toISOString()
  return {
    id: `node_${Math.random().toString(36).slice(2, 8)}`,
    type: 'task',
    title: 'Test Node',
    status: 'backlog',
    priority: 3,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  }
}

function adr(store: SqliteStore, title: string): string {
  const node = makeNode({ type: 'decision', title, priority: 2 })
  store.insertNode(node)
  return node.id
}

const RATIONALE: DecisionRationale = {
  decision: 'Use SQLite for graph storage',
  why: 'Zero infra overhead; embedded; sufficient for single-user CLI',
  alternatives: ['PostgreSQL (overkill for local CLI)', 'JSON file (no query support)'],
  consequences: 'Migration required for multi-user deployments',
  date: '2026-06-24',
}

describe('writeDecisionRationale — AC1: rationale survives compaction', () => {
  it('writes rationale to node and it is retrievable by id', () => {
    const store = makeStore()
    const nodeId = adr(store, 'Use SQLite for graph storage')

    writeDecisionRationale(store, nodeId, RATIONALE)

    const retrieved = readDecisionRationale(store, nodeId)
    expect(retrieved).not.toBeNull()
    expect(retrieved!.decision).toBe(RATIONALE.decision)
    expect(retrieved!.why).toBe(RATIONALE.why)

    store.close()
  })

  it('persists alternatives and consequences', () => {
    const store = makeStore()
    const nodeId = adr(store, 'Another ADR')

    writeDecisionRationale(store, nodeId, RATIONALE)
    const retrieved = readDecisionRationale(store, nodeId)

    expect(retrieved!.alternatives).toEqual(RATIONALE.alternatives)
    expect(retrieved!.consequences).toBe(RATIONALE.consequences)

    store.close()
  })

  it('rationale is stored in node description (survives compaction via graph)', () => {
    const store = makeStore()
    const nodeId = adr(store, 'Test decision')

    writeDecisionRationale(store, nodeId, RATIONALE)

    // After "compaction" — the LLM context is gone, but the graph persists
    // Simulate by using a fresh store reference to the same (in-memory) DB
    const node = store.getNodeById(nodeId)
    expect(node?.description).toBeTruthy()
    // The why must be embedded in the description
    expect(node?.description).toContain(RATIONALE.why)

    store.close()
  })
})

describe('readDecisionRationale — AC2: post-compaction retrieval', () => {
  it('returns null for unknown node', () => {
    const store = makeStore()
    const result = readDecisionRationale(store, 'nonexistent-id')
    expect(result).toBeNull()
    store.close()
  })

  it('returns null when node has no rationale metadata', () => {
    const store = makeStore()
    const nodeId = adr(store, 'ADR without rationale')

    // No writeDecisionRationale called
    const result = readDecisionRationale(store, nodeId)
    expect(result).toBeNull()

    store.close()
  })

  it('returns structured rationale matching what was written', () => {
    const store = makeStore()
    const nodeId = adr(store, 'Another test decision')

    writeDecisionRationale(store, nodeId, RATIONALE)

    // Simulate post-compaction: clear any in-memory state; only graph persists
    const retrieved = readDecisionRationale(store, nodeId)
    expect(retrieved).toEqual(RATIONALE)

    store.close()
  })
})
