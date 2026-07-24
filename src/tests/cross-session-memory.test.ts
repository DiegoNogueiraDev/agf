/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { saveHarnessMemory, getHarnessMemory } from '../core/harness/cross-session-memory.js'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_settings (
      project_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, key)
    );
  `)
  return db
}

describe('cross-session-memory', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createDb()
  })

  it('saves and retrieves harness memory state', () => {
    const state = { lastScore: 85, lastGrade: 'A', patterns: ['pattern1', 'pattern2'] }
    saveHarnessMemory(db, state)
    const retrieved = getHarnessMemory(db)
    expect(retrieved).toEqual(state)
  })

  it('returns null when no memory has been saved', () => {
    const retrieved = getHarnessMemory(db)
    expect(retrieved).toBeNull()
  })

  it('overwrites existing memory on save', () => {
    saveHarnessMemory(db, { lastScore: 50, lastGrade: 'D', patterns: ['old'] })
    saveHarnessMemory(db, { lastScore: 90, lastGrade: 'A', patterns: ['new'] })
    const retrieved = getHarnessMemory(db)
    expect(retrieved!.lastScore).toBe(90)
    expect(retrieved!.patterns).toEqual(['new'])
  })

  it('returns null for corrupted JSON', () => {
    const projectId = 'default'
    db.prepare('INSERT OR IGNORE INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      projectId,
      'default',
      new Date().toISOString(),
      new Date().toISOString(),
    )
    db.prepare(
      "INSERT OR REPLACE INTO project_settings (project_id, key, value, updated_at) VALUES (?, 'harness_memory_state', '{bad json', ?)",
    ).run(projectId, new Date().toISOString())
    const retrieved = getHarnessMemory(db)
    expect(retrieved).toBeNull()
  })
})
