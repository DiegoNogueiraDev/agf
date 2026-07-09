/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 2.1 AC coverage: PRAGMA integrity_check before snapshot
 *
 * AC1: GIVEN DB íntegro WHEN createSnapshot THEN snapshot criado normalmente
 * AC2: GIVEN DB corrompido WHEN createSnapshot THEN lança erro com lista de problemas
 * AC3: GIVEN --force WHEN DB corrompido THEN snapshot criado com warning
 * AC4: checkDbIntegrityForSnapshot returns detail rows (not just boolean)
 */

import { describe, it, expect, vi } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { checkDbIntegrityForSnapshot } from '../core/store/db-recovery.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function freshStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('snap-integrity-test')
  return store
}

// ── AC1: healthy DB → snapshot created normally ───────────────────────────────

describe('AC1: healthy DB → createSnapshot succeeds', () => {
  it('createSnapshot returns a numeric ID on a healthy DB', () => {
    const store = freshStore()
    const id = store.createSnapshot()
    expect(typeof id).toBe('number')
    expect(id).toBeGreaterThan(0)
    store.close()
  })

  it('listSnapshots finds the created snapshot', () => {
    const store = freshStore()
    const id = store.createSnapshot()
    const list = store.listSnapshots()
    expect(list.some((s) => s.snapshotId === id)).toBe(true)
    store.close()
  })

  it('createSnapshot({ force: false }) on healthy DB succeeds', () => {
    const store = freshStore()
    expect(() => store.createSnapshot({ force: false })).not.toThrow()
    store.close()
  })
})

// ── AC2: corrupted DB → createSnapshot throws with detail ────────────────────

describe('AC2: corrupted DB → createSnapshot throws with corruption details', () => {
  it('throws SnapshotIntegrityError when integrity check fails', () => {
    const store = freshStore()
    const db = store.getDb()

    // Simulate integrity failure by mocking the PRAGMA result
    const origPrepare = db.prepare.bind(db)
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('integrity_check')) {
        return {
          all: () => [{ integrity_check: 'page 3 is not formatted' }],
          get: () => ({ integrity_check: 'page 3 is not formatted' }),
          run: () => ({ changes: 0, lastInsertRowid: 0 }),
        } as unknown as ReturnType<typeof db.prepare>
      }
      return origPrepare(sql)
    })

    expect(() => store.createSnapshot()).toThrow()
    vi.restoreAllMocks()
    store.close()
  })

  it('error message includes corruption details when check fails', () => {
    const store = freshStore()
    const db = store.getDb()
    const origPrepare = db.prepare.bind(db)

    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('integrity_check')) {
        return {
          all: () => [{ integrity_check: 'corrupt page 5' }],
          get: () => ({ integrity_check: 'corrupt page 5' }),
          run: () => ({ changes: 0, lastInsertRowid: 0 }),
        } as unknown as ReturnType<typeof db.prepare>
      }
      return origPrepare(sql)
    })

    let message = ''
    try {
      store.createSnapshot()
    } catch (e: unknown) {
      message = e instanceof Error ? e.message : String(e)
    }

    expect(message.toLowerCase()).toMatch(/integr|corrupt|snapshot|check/)
    vi.restoreAllMocks()
    store.close()
  })

  it('does NOT create a snapshot when integrity check fails', () => {
    const store = freshStore()
    const db = store.getDb()
    const origPrepare = db.prepare.bind(db)
    const beforeCount = store.listSnapshots().length

    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('integrity_check')) {
        return {
          all: () => [{ integrity_check: 'page 3 is damaged' }],
          get: () => ({ integrity_check: 'page 3 is damaged' }),
          run: () => ({ changes: 0, lastInsertRowid: 0 }),
        } as unknown as ReturnType<typeof db.prepare>
      }
      return origPrepare(sql)
    })

    try {
      store.createSnapshot()
    } catch {
      /* expected */
    }

    const afterCount = store.listSnapshots().length
    expect(afterCount).toBe(beforeCount)
    vi.restoreAllMocks()
    store.close()
  })
})

// ── AC3: --force flag → snapshot despite corruption + warning logged ──────────

describe('AC3: force:true bypasses integrity check', () => {
  it('createSnapshot({ force: true }) succeeds even when integrity check would fail', () => {
    const store = freshStore()
    const db = store.getDb()
    const origPrepare = db.prepare.bind(db)

    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('integrity_check')) {
        return {
          all: () => [{ integrity_check: 'page 99 is corrupt' }],
          get: () => ({ integrity_check: 'page 99 is corrupt' }),
          run: () => ({ changes: 0, lastInsertRowid: 0 }),
        } as unknown as ReturnType<typeof db.prepare>
      }
      return origPrepare(sql)
    })

    expect(() => store.createSnapshot({ force: true })).not.toThrow()
    vi.restoreAllMocks()
    store.close()
  })

  it('createSnapshot({ force: true }) returns a valid snapshot ID', () => {
    const store = freshStore()
    const db = store.getDb()
    const origPrepare = db.prepare.bind(db)

    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('integrity_check')) {
        return {
          all: () => [{ integrity_check: 'error on page 7' }],
          get: () => ({ integrity_check: 'error on page 7' }),
          run: () => ({ changes: 0, lastInsertRowid: 0 }),
        } as unknown as ReturnType<typeof db.prepare>
      }
      return origPrepare(sql)
    })

    const id = store.createSnapshot({ force: true })
    expect(typeof id).toBe('number')
    expect(id).toBeGreaterThan(0)
    vi.restoreAllMocks()
    store.close()
  })
})

// ── AC4: checkDbIntegrityForSnapshot — detail rows ───────────────────────────

describe('AC4: checkDbIntegrityForSnapshot returns detail rows', () => {
  it('returns { ok: true, issues: [] } for a healthy in-memory DB', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    const result = checkDbIntegrityForSnapshot(db)
    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
    db.close()
  })

  it('issues is always an array (not null)', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    const result = checkDbIntegrityForSnapshot(db)
    expect(Array.isArray(result.issues)).toBe(true)
    db.close()
  })
})

// ── SWE 0.20.0 Task 4.2: restoreSnapshot round-trip (recuperação do grafo) ─────

describe('restoreSnapshot round-trip restores graph state', () => {
  function node(id: string, status: string): import('../core/graph/graph-types.js').GraphNode {
    const now = new Date().toISOString()
    return {
      id,
      type: 'task',
      title: id,
      status: status as never,
      priority: 1,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    }
  }

  it('AC2: após mutação, restaurar o snapshot volta o grafo ao estado salvo', () => {
    const store = freshStore()
    store.insertNode(node('n1', 'backlog'))
    const snapId = store.createSnapshot()

    // mutação pós-snapshot: adiciona um nó que NÃO existia no snapshot
    store.insertNode(node('n2', 'backlog'))
    expect(store.getNodeById('n2')).not.toBeNull()

    const r = store.restoreSnapshot(snapId)
    expect(r.nodesValid).toBeGreaterThanOrEqual(1)

    // estado válido restaurado: n1 presente, n2 (pós-snapshot) sumiu
    expect(store.getNodeById('n1')).not.toBeNull()
    expect(store.getNodeById('n2')).toBeNull()
    store.close()
  })
})
