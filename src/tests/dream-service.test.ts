import Database from 'better-sqlite3'
import { describe, it, expect } from 'vitest'
import { dreamStatus, dreamHistory, cancelDreamCycle, dreamArchiveEntries } from '../core/economy/dream-service.js'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE dream_cycles (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      config TEXT NOT NULL,
      result TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      error_message TEXT
    );
    CREATE TABLE dream_archive (
      id TEXT PRIMARY KEY,
      original_doc_id TEXT NOT NULL,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL,
      quality_score REAL,
      reason TEXT NOT NULL,
      archived_at TEXT NOT NULL,
      cycle_id TEXT NOT NULL
    );
  `)
  return db
}

describe('dreamStatus', () => {
  it('returns null on empty database', () => {
    expect(dreamStatus(makeDb())).toBeNull()
  })

  it('returns latest cycle by started_at', () => {
    const db = makeDb()
    db.prepare(`INSERT INTO dream_cycles (id, status, config, result, started_at) VALUES (?, ?, ?, NULL, ?)`).run(
      'cycle_a',
      'completed',
      '{}',
      '2026-01-01T10:00:00.000Z',
    )
    db.prepare(`INSERT INTO dream_cycles (id, status, config, result, started_at) VALUES (?, ?, ?, NULL, ?)`).run(
      'cycle_b',
      'running',
      '{"phases":["nrem"]}',
      '2026-01-02T10:00:00.000Z',
    )
    const latest = dreamStatus(db)
    expect(latest?.id).toBe('cycle_b')
    expect(latest?.status).toBe('running')
  })
})

describe('dreamHistory', () => {
  it('returns empty array on empty database', () => {
    expect(dreamHistory(makeDb())).toEqual([])
  })

  it('returns cycles newest first', () => {
    const db = makeDb()
    db.prepare(`INSERT INTO dream_cycles (id, status, config, result, started_at) VALUES (?, ?, ?, NULL, ?)`).run(
      'c1',
      'completed',
      '{}',
      '2026-01-01T10:00:00.000Z',
    )
    db.prepare(`INSERT INTO dream_cycles (id, status, config, result, started_at) VALUES (?, ?, ?, NULL, ?)`).run(
      'c2',
      'completed',
      '{}',
      '2026-01-02T10:00:00.000Z',
    )
    const history = dreamHistory(db)
    expect(history[0].id).toBe('c2')
    expect(history[1].id).toBe('c1')
  })

  it('respects limit parameter', () => {
    const db = makeDb()
    for (let i = 0; i < 5; i++) {
      db.prepare(`INSERT INTO dream_cycles (id, status, config, result, started_at) VALUES (?, ?, ?, NULL, ?)`).run(
        `c${i}`,
        'completed',
        '{}',
        `2026-01-0${i + 1}T10:00:00.000Z`,
      )
    }
    expect(dreamHistory(db, 3)).toHaveLength(3)
  })
})

describe('cancelDreamCycle', () => {
  it('returns false when no running cycle exists', () => {
    expect(cancelDreamCycle(makeDb())).toBe(false)
  })

  it('cancels a running cycle and returns true', () => {
    const db = makeDb()
    db.prepare(`INSERT INTO dream_cycles (id, status, config, result, started_at) VALUES (?, ?, ?, NULL, ?)`).run(
      'cycle_run',
      'running',
      '{}',
      new Date().toISOString(),
    )
    expect(cancelDreamCycle(db)).toBe(true)
    const row = db.prepare(`SELECT status FROM dream_cycles WHERE id = 'cycle_run'`).get() as { status: string }
    expect(row.status).toBe('cancelled')
  })

  it('only cancels the first running cycle', () => {
    const db = makeDb()
    db.prepare(`INSERT INTO dream_cycles (id, status, config, result, started_at) VALUES (?, ?, ?, NULL, ?)`).run(
      'r1',
      'running',
      '{}',
      '2026-01-01T10:00:00.000Z',
    )
    db.prepare(`INSERT INTO dream_cycles (id, status, config, result, started_at) VALUES (?, ?, ?, NULL, ?)`).run(
      'r2',
      'running',
      '{}',
      '2026-01-02T10:00:00.000Z',
    )
    cancelDreamCycle(db)
    const running = db.prepare(`SELECT COUNT(*) AS c FROM dream_cycles WHERE status = 'running'`).get() as { c: number }
    expect(running.c).toBe(1)
  })
})

describe('dreamArchiveEntries', () => {
  it('returns empty array for unknown cycle', () => {
    expect(dreamArchiveEntries(makeDb(), 'unknown')).toEqual([])
  })

  it('returns entries for a given cycle', () => {
    const db = makeDb()
    db.prepare(
      `INSERT INTO dream_archive (id, original_doc_id, title, source_type, quality_score, reason, archived_at, cycle_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('da_1', 'doc_abc', 'Stale trail', 'pheromone', 0.01, 'stale', new Date().toISOString(), 'cycle_1')
    const entries = dreamArchiveEntries(db, 'cycle_1')
    expect(entries).toHaveLength(1)
    expect(entries[0].originalDocId).toBe('doc_abc')
    expect(entries[0].reason).toBe('stale')
  })
})
