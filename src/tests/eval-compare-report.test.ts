import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { compareEvalRunsPerScenario, type ScenarioDiffRow } from '../core/evals/eval-compare.js'

let db: Database.Database

function seed(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS eval_golden (
      id TEXT PRIMARY KEY, input TEXT NOT NULL, expected TEXT NOT NULL,
      scorer_kind TEXT NOT NULL, tool TEXT NOT NULL,
      project_id TEXT, metadata TEXT, tags TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS eval_run (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, golden_id TEXT NOT NULL,
      score REAL NOT NULL, passed INTEGER NOT NULL,
      latency_ms INTEGER, model_used TEXT, cost_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (golden_id) REFERENCES eval_golden(id) ON DELETE CASCADE
    );
  `)
  db.prepare('INSERT INTO eval_golden VALUES (?,?,?,?,?,?,?,?,?)').run(
    'g1',
    'q1',
    'a1',
    'exact',
    'agf',
    null,
    null,
    null,
    '2026-01-01T00:00:00Z',
  )
  db.prepare('INSERT INTO eval_golden VALUES (?,?,?,?,?,?,?,?,?)').run(
    'g2',
    'q2',
    'a2',
    'exact',
    'agf',
    null,
    null,
    null,
    '2026-01-01T00:00:00Z',
  )
  // Baseline session
  db.prepare('INSERT INTO eval_run VALUES (?,?,?,?,?,?,?,?,?)').run(
    'r1',
    'baseline',
    'g1',
    0.9,
    1,
    100,
    'model-a',
    0.001,
    '2026-01-01T00:00:00Z',
  )
  db.prepare('INSERT INTO eval_run VALUES (?,?,?,?,?,?,?,?,?)').run(
    'r2',
    'baseline',
    'g2',
    0.7,
    0,
    200,
    'model-a',
    0.002,
    '2026-01-01T00:00:00Z',
  )
  // New session
  db.prepare('INSERT INTO eval_run VALUES (?,?,?,?,?,?,?,?,?)').run(
    'r3',
    'haiku-first',
    'g1',
    0.85,
    1,
    80,
    'model-b',
    0.0008,
    '2026-01-01T00:00:00Z',
  )
  db.prepare('INSERT INTO eval_run VALUES (?,?,?,?,?,?,?,?,?)').run(
    'r4',
    'haiku-first',
    'g2',
    0.75,
    1,
    150,
    'model-b',
    0.0015,
    '2026-01-01T00:00:00Z',
  )
}

beforeEach(() => {
  db = new Database(':memory:')
  seed(db)
})

afterEach(() => {
  db.close()
})

describe('compareEvalRunsPerScenario', () => {
  it('returns one row per scenario that appears in either run', () => {
    const rows = compareEvalRunsPerScenario(db, 'baseline', 'haiku-first')
    expect(rows.length).toBe(2)
  })

  it('each row has goldenId, scoreA, scoreB, costA, costB, deltaCost, deltaScore', () => {
    const rows = compareEvalRunsPerScenario(db, 'baseline', 'haiku-first')
    for (const r of rows) {
      expect(r.goldenId).toBeDefined()
      expect(typeof r.scoreA).toBe('number')
      expect(typeof r.scoreB).toBe('number')
      expect(typeof r.costA).toBe('number')
      expect(typeof r.costB).toBe('number')
      expect(typeof r.deltaCost).toBe('number')
      expect(typeof r.deltaScore).toBe('number')
    }
  })

  it('deltaCost = costB - costA', () => {
    const rows = compareEvalRunsPerScenario(db, 'baseline', 'haiku-first')
    for (const r of rows) {
      expect(r.deltaCost).toBeCloseTo(r.costB - r.costA, 8)
    }
  })

  it('deltaScore = scoreB - scoreA', () => {
    const rows = compareEvalRunsPerScenario(db, 'baseline', 'haiku-first')
    for (const r of rows) {
      expect(r.deltaScore).toBeCloseTo(r.scoreB - r.scoreA, 8)
    }
  })

  it('fills null for missing scenarios (A only or B only)', () => {
    // Add a scenario only in baseline
    db.prepare('INSERT INTO eval_golden VALUES (?,?,?,?,?,?,?,?,?)').run(
      'g3',
      'q3',
      'a3',
      'exact',
      'agf',
      null,
      null,
      null,
      '2026-01-01T00:00:00Z',
    )
    db.prepare('INSERT INTO eval_run VALUES (?,?,?,?,?,?,?,?,?)').run(
      'r5',
      'baseline',
      'g3',
      0.6,
      0,
      300,
      'model-a',
      0.003,
      '2026-01-01T00:00:00Z',
    )
    const rows = compareEvalRunsPerScenario(db, 'baseline', 'haiku-first')
    expect(rows.length).toBe(3)
    const g3Row = rows.find((r) => r.goldenId === 'g3')
    expect(g3Row).toBeDefined()
    expect(g3Row!.scoreA).toBe(0.6)
    expect(g3Row!.scoreB).toBeNull()
  })

  it('returns empty array when both sessions have no data', () => {
    const rows = compareEvalRunsPerScenario(db, 'nonexistent-a', 'nonexistent-b')
    expect(rows).toHaveLength(0)
  })
})

describe('ScenarioDiffRow type shape', () => {
  it('passedA and passedB are booleans', () => {
    const rows = compareEvalRunsPerScenario(db, 'baseline', 'haiku-first')
    for (const r of rows) {
      expect(typeof r.passedA === 'boolean' || r.passedA === null).toBe(true)
      expect(typeof r.passedB === 'boolean' || r.passedB === null).toBe(true)
    }
  })
})
