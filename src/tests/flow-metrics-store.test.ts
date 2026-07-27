/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { insertFlowMetric, queryFlowMetrics } from '../core/context/flow-metrics-store.js'
import Database from 'better-sqlite3'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS flow_metrics (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      node_id TEXT,
      mode TEXT,
      phi REAL,
      lambda REAL,
      tokens_baseline INTEGER,
      tokens_actual INTEGER,
      pruned_count INTEGER,
      pinned_count INTEGER,
      created_at INTEGER
    )
  `)
  return db
}

describe('flow-metrics-store', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  it('insertFlowMetric inserts a row', () => {
    insertFlowMetric(db, {
      id: 'fm1',
      projectId: 'proj-1',
      nodeId: 'node-1',
      mode: 'flow_on',
      phi: 0.5,
      lambda: 0.8,
      tokensBaseline: 500,
      tokensActual: 200,
      prunedCount: 3,
      pinnedCount: 1,
      createdAt: Date.now(),
    })
    const rows = db.prepare('SELECT * FROM flow_metrics').all()
    expect(rows).toHaveLength(1)
  })

  it('queryFlowMetrics returns empty array when no data', () => {
    const results = queryFlowMetrics(db)
    expect(results).toEqual([])
  })

  it('queryFlowMetrics returns all rows without filters', () => {
    insertFlowMetric(db, {
      id: 'fm1',
      projectId: 'p1',
      nodeId: 'n1',
      mode: 'flow_on',
      phi: 0.5,
      lambda: 0.8,
      tokensBaseline: 500,
      tokensActual: 200,
      prunedCount: 3,
      pinnedCount: 1,
      createdAt: Date.now(),
    })
    insertFlowMetric(db, {
      id: 'fm2',
      projectId: 'p2',
      nodeId: 'n2',
      mode: 'flow_off',
      phi: 0.3,
      lambda: 0.5,
      tokensBaseline: 400,
      tokensActual: 400,
      prunedCount: 0,
      pinnedCount: 0,
      createdAt: Date.now(),
    })
    const results = queryFlowMetrics(db)
    expect(results).toHaveLength(2)
  })

  it('queryFlowMetrics filters by mode', () => {
    insertFlowMetric(db, {
      id: 'fm1',
      projectId: 'p1',
      nodeId: 'n1',
      mode: 'flow_on',
      phi: 0.5,
      lambda: 0.8,
      tokensBaseline: 500,
      tokensActual: 200,
      prunedCount: 3,
      pinnedCount: 1,
      createdAt: Date.now(),
    })
    insertFlowMetric(db, {
      id: 'fm2',
      projectId: 'p1',
      nodeId: 'n2',
      mode: 'flow_off',
      phi: 0.3,
      lambda: 0.5,
      tokensBaseline: 400,
      tokensActual: 400,
      prunedCount: 0,
      pinnedCount: 0,
      createdAt: Date.now(),
    })
    const results = queryFlowMetrics(db, { mode: 'flow_on' })
    expect(results).toHaveLength(1)
    expect(results[0].mode).toBe('flow_on')
  })
})
