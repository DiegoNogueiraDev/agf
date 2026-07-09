/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { createRun, transitionRun } from '../core/session/run.js'
import { upsertRun, getActiveRun } from '../core/session/run-store.js'
import { RunSchema, type RunBudget } from '../schemas/session.schema.js'

const budget: RunBudget = { scope: 'run', currentUsd: 0, capUsd: 5 }

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

describe('run-store', () => {
  it('persists and reads back an active run (budget round-trips)', () => {
    const db = freshDb()
    try {
      const run = transitionRun(createRun('run_1', budget), 'active')
      upsertRun(db, run, 'sess_1')
      const active = getActiveRun(db, 'sess_1')
      expect(active).not.toBeNull()
      expect(active!.runId).toBe('run_1')
      expect(active!.budget.capUsd).toBe(5)
      expect(RunSchema.safeParse(active).success).toBe(true)
    } finally {
      db.close()
    }
  })

  it('ignores completed/failed runs (returns null)', () => {
    const db = freshDb()
    try {
      const done = transitionRun(transitionRun(createRun('r', budget), 'active'), 'completed')
      upsertRun(db, done, 'sess_1')
      expect(getActiveRun(db, 'sess_1')).toBeNull()
    } finally {
      db.close()
    }
  })

  it('returns null when there are no runs', () => {
    const db = freshDb()
    try {
      expect(getActiveRun(db)).toBeNull()
    } finally {
      db.close()
    }
  })
})
