/*!
 * SPDX-License-Identifier: Apache-2.0
 * Tests for src/core/planner/replan-analyzer.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { analyzeReplanSuggest } from '../core/planner/replan-analyzer.js'
import type { GraphDocument, GraphNode, GraphEdge } from '../core/graph/graph-types.js'

function makeDoc(nodes: Partial<GraphNode>[], edges: GraphEdge[] = []): GraphDocument {
  const now = new Date().toISOString()
  const fullNodes: GraphNode[] = nodes.map((n, i) => ({
    id: n.id ?? `node-${i}`,
    type: n.type ?? 'task',
    title: n.title ?? `Task ${i}`,
    status: n.status ?? 'backlog',
    priority: n.priority ?? 3,
    xpSize: n.xpSize,
    estimateMinutes: n.estimateMinutes,
    sprint: n.sprint ?? null,
    createdAt: now,
    updatedAt: now,
  }))
  return {
    version: '1',
    project: { id: 'p1', name: 'Test', createdAt: now, updatedAt: now },
    nodes: fullNodes,
    edges,
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS node_changelog (
      id TEXT,
      node_id TEXT,
      field TEXT,
      old_value TEXT,
      new_value TEXT,
      changed_at TEXT
    )
  `)
  return db
}

describe('analyzeReplanSuggest', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeDb()
  })

  it('returns healthStatus healthy for empty graph', () => {
    const doc = makeDoc([])
    const report = analyzeReplanSuggest(doc, db)
    expect(report.healthStatus).toBe('healthy')
    expect(report.proposals).toHaveLength(0)
  })

  it('returns healthStatus healthy for graph with backlog tasks and no divergence', () => {
    const doc = makeDoc([
      { id: 't1', type: 'task', status: 'backlog', estimateMinutes: 60 },
      { id: 't2', type: 'task', status: 'backlog', estimateMinutes: 30 },
    ])
    const report = analyzeReplanSuggest(doc, db)
    expect(report.healthStatus).toBe('healthy')
    expect(report.metrics.overdueTaskCount).toBe(0)
  })

  it('returns unhealthy when 3 or more tasks depend on the same undone node', () => {
    const now = new Date().toISOString()
    const edges: GraphEdge[] = [
      { id: 'e1', from: 't1', to: 'blocker', relationType: 'depends_on', createdAt: now },
      { id: 'e2', from: 't2', to: 'blocker', relationType: 'depends_on', createdAt: now },
      { id: 'e3', from: 't3', to: 'blocker', relationType: 'depends_on', createdAt: now },
    ]
    const doc = makeDoc(
      [
        { id: 't1', type: 'task', status: 'backlog' },
        { id: 't2', type: 'task', status: 'backlog' },
        { id: 't3', type: 'task', status: 'backlog' },
        { id: 'blocker', type: 'task', status: 'in_progress' },
      ],
      edges,
    )
    const report = analyzeReplanSuggest(doc, db)
    expect(report.healthStatus).toBe('unhealthy')
    expect(report.proposals.some((p) => p.action === 'break_dependency')).toBe(true)
  })

  it('report includes proposalId and generatedAt fields', () => {
    const doc = makeDoc([])
    const report = analyzeReplanSuggest(doc, db)
    expect(typeof report.proposalId).toBe('string')
    expect(report.proposalId.length).toBeGreaterThan(0)
    expect(typeof report.generatedAt).toBe('string')
  })
})
