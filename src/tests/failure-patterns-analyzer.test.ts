/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { analyzeFailurePatterns } from '../core/analyzer/failure-patterns-analyzer.js'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS failure_signals (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      signalKind TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT '{}',
      severity TEXT NOT NULL DEFAULT 'warn',
      timestamp TEXT NOT NULL,
      rawError TEXT
    )
  `)
  return db
}

function insertSignal(
  db: Database.Database,
  overrides: {
    source?: string
    signalKind?: string
    context?: string
    severity?: string
    timestamp?: Date
    rawError?: string
  },
) {
  const id = Math.random().toString(36).slice(2, 10)
  const ts = (overrides.timestamp ?? new Date()).toISOString()
  db.prepare(
    'INSERT INTO failure_signals (id, source, signalKind, context, severity, timestamp, rawError) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    overrides.source ?? 'test',
    overrides.signalKind ?? 'unknown',
    overrides.context ?? '{}',
    overrides.severity ?? 'warn',
    ts,
    overrides.rawError ?? null,
  )
}

const recent = (): Date => new Date(Date.now() - 1000)
const old = (): Date => new Date(Date.now() - 400 * 24 * 60 * 60_000)

describe('analyzeFailurePatterns', () => {
  it('returns empty report when table returns no rows', () => {
    const db = createTestDb()
    const result = analyzeFailurePatterns(db, 30)
    expect(result.patterns).toEqual([])
    expect(result.summary.total).toBe(0)
  })

  it('returns empty report when signals do not match any pattern', () => {
    const db = createTestDb()
    insertSignal(db, { source: 'test', signalKind: 'irrelevant' })
    const result = analyzeFailurePatterns(db, 30)
    expect(result.patterns).toEqual([])
    expect(result.summary.signalCount).toBe(1)
  })

  it('detects sqlite_lock_storm pattern', () => {
    const db = createTestDb()
    insertSignal(db, { source: 'sqlite', signalKind: 'SQLITE_BUSY' })
    insertSignal(db, { source: 'sqlite', signalKind: 'SQLITE_BUSY' })
    insertSignal(db, { source: 'sqlite', signalKind: 'SQLITE_BUSY' })
    const result = analyzeFailurePatterns(db, 30)
    const sqlitePattern = result.patterns.find((p) => p.patternType === 'sqlite_lock_storm')
    expect(sqlitePattern).toBeDefined()
    expect(sqlitePattern!.severity).toBe('critical')
  })

  it('detects gate_blocking_too_often pattern', () => {
    const db = createTestDb()
    for (let i = 0; i < 6; i++) {
      insertSignal(db, {
        source: 'lifecycle_gate',
        signalKind: 'gate_blocked',
        context: JSON.stringify({ toolName: 'analyze' }),
      })
    }
    const result = analyzeFailurePatterns(db, 30)
    const gatePattern = result.patterns.find((p) => p.patternType === 'gate_blocking_too_often')
    expect(gatePattern).toBeDefined()
    expect(gatePattern!.count).toBeGreaterThanOrEqual(5)
  })

  it('detects tool_failing_for_input_kind pattern', () => {
    const db = createTestDb()
    for (let i = 0; i < 4; i++) {
      insertSignal(db, {
        source: 'tool_invocation',
        signalKind: 'tool_isError',
        context: JSON.stringify({ toolName: 'export' }),
      })
    }
    const result = analyzeFailurePatterns(db, 30)
    const toolPattern = result.patterns.find((p) => p.patternType === 'tool_failing_for_input_kind')
    expect(toolPattern).toBeDefined()
    expect(toolPattern!.count).toBeGreaterThanOrEqual(3)
  })

  it('respects windowDays filter', () => {
    const db = createTestDb()
    insertSignal(db, { source: 'sqlite', signalKind: 'SQLITE_BUSY', timestamp: old() })
    insertSignal(db, { source: 'sqlite', signalKind: 'SQLITE_BUSY', timestamp: old() })
    const result = analyzeFailurePatterns(db, 30)
    expect(result.patterns).toEqual([])
  })

  it('handles non-existent failure_signals table gracefully', () => {
    const db = new Database(':memory:')
    const result = analyzeFailurePatterns(db, 30)
    expect(result.patterns).toEqual([])
    expect(result.summary.total).toBe(0)
  })

  it('returns openProposals from the map parameter', () => {
    const db = createTestDb()
    for (let i = 0; i < 5; i++) {
      insertSignal(db, { source: 'sqlite', signalKind: 'SQLITE_BUSY' })
    }
    const proposals = new Map<string, number>([['sqlite_lock_storm', 3]])
    const result = analyzeFailurePatterns(db, 30, proposals)
    const sqlitePattern = result.patterns.find((p) => p.patternType === 'sqlite_lock_storm')
    expect(sqlitePattern!.openProposals).toBe(3)
  })
})
