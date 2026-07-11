/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { computeFlowReport } from '../core/context/flow-report.js'
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS episodic_outcomes (
      id TEXT PRIMARY KEY,
      node_id TEXT,
      task_type TEXT,
      tags TEXT,
      approach_summary TEXT,
      outcome TEXT,
      cycle_time_delta REAL,
      reopen_count INTEGER DEFAULT 0,
      created_at TEXT
    )
  `)
  return db
}

describe('flow-report', () => {
  it('returns no_data when no telemetry exists', () => {
    const db = createTestDb()
    const report = computeFlowReport(db)
    expect(report.verdict).toBe('no_data')
    expect(report.rationale).toContain('No flow telemetry')
  })

  it('returns inconclusive when only one arm has data', () => {
    const db = createTestDb()
    db.prepare(
      `INSERT INTO flow_metrics (id, project_id, node_id, mode, phi, lambda, tokens_baseline, tokens_actual, pruned_count, pinned_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('fm1', 'p1', 'n1', 'flow_on', 0.5, 0.8, 500, 200, 3, 1, Date.now())
    const report = computeFlowReport(db)
    expect(report.verdict).toBe('inconclusive')
  })
})
