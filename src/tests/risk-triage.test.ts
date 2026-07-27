/*!
 * Task node_aefc6bfac3c3 — agf risk triage command.
 *
 * AC1: dry-run (no flags) → lists risks without mutating.
 * AC2: --promote <id> → creates child task + related_to edge + marks risk addressed.
 * AC3: --accept <id> --reason <txt> → sets metadata; --close <id> soft-deletes.
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { triageRisks } from '../core/risk/risk-triage.js'

function makeStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('test-project')
  return store
}

function riskNode(id: string, title: string) {
  return {
    id,
    type: 'risk' as const,
    status: 'backlog' as const,
    title,
    priority: 2,
    blocked: false,
    acceptanceCriteria: [],
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('triageRisks — dry-run (AC1)', () => {
  it('returns list of open risks without mutating the graph', () => {
    const store = makeStore()
    store.insertNode(riskNode('r1', 'Risk: DB failure'))
    store.insertNode(riskNode('r2', 'Risk: Auth bypass'))

    const result = triageRisks(store, { dryRun: true })
    expect(result.risks.length).toBe(2)
    expect(result.mutated).toBe(false)
    // Store unchanged — risks still backlog
    const doc = store.toGraphDocument()
    expect(doc.nodes.filter((n) => n.type === 'risk' && n.status === 'backlog')).toHaveLength(2)
  })
})

describe('triageRisks — promote (AC2)', () => {
  it('creates a child task + related_to edge and marks risk addressed', () => {
    const store = makeStore()
    store.insertNode(riskNode('r1', 'Risk: DB failure'))

    const result = triageRisks(store, { dryRun: false, promote: ['r1'] })
    expect(result.mutated).toBe(true)

    const doc = store.toGraphDocument()
    // A new task should exist
    const tasks = doc.nodes.filter((n) => n.type === 'task')
    expect(tasks.length).toBe(1)
    expect(tasks[0].title).toContain('Risk: DB failure')

    // An edge related_to should connect the task to r1
    const edge = doc.edges.find((e) => e.from === tasks[0].id && e.to === 'r1')
    expect(edge).toBeDefined()
    expect(edge?.relationType).toBe('related_to')

    // Risk marked addressed
    const risk = doc.nodes.find((n) => n.id === 'r1')
    expect(risk?.metadata?.addressed).toBe(true)
  })
})

describe('triageRisks — accept / close (AC3)', () => {
  it('accept sets metadata accepted + reason', () => {
    const store = makeStore()
    store.insertNode(riskNode('r1', 'Risk: Low priority'))

    triageRisks(store, { dryRun: false, accept: [{ id: 'r1', reason: 'Accepted by team' }] })

    const doc = store.toGraphDocument()
    const risk = doc.nodes.find((n) => n.id === 'r1')
    expect(risk?.metadata?.accepted).toBe(true)
    expect(risk?.metadata?.reason).toBe('Accepted by team')
  })

  it('close archives the risk (status → done)', () => {
    const store = makeStore()
    store.insertNode(riskNode('r2', 'Risk: Obsolete'))

    triageRisks(store, { dryRun: false, close: ['r2'] })

    const doc = store.toGraphDocument()
    const risk = doc.nodes.find((n) => n.id === 'r2')
    expect(risk?.status).toBe('done')
  })
})
