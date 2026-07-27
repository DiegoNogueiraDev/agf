/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Cross-Session Harness Memory — Persist harness state between CLI sessions
 *
 * Uses project_settings table to store JSON-serialized state.
 * ADR-V4-06: ProjectSettings persistence, not filesystem.
 */

import type Database from 'better-sqlite3'

export interface HarnessMemoryState {
  lastScore: number
  lastGrade: string
  patterns: string[]
}

const SETTING_KEY = 'harness_memory_state'

function getProjectId(db: Database.Database): string {
  const row = db.prepare('SELECT id FROM projects LIMIT 1').get() as { id: string } | undefined
  return row?.id ?? 'default'
}

function ensureProject(db: Database.Database, projectId: string): void {
  const now = new Date().toISOString()
  db.prepare('INSERT OR IGNORE INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    projectId,
    'default',
    now,
    now,
  )
}

/** saveHarnessMemory —  */
export function saveHarnessMemory(db: Database.Database, state: HarnessMemoryState): void {
  const projectId = getProjectId(db)
  ensureProject(db, projectId)
  const json = JSON.stringify(state)
  db.prepare('INSERT OR REPLACE INTO project_settings (project_id, key, value, updated_at) VALUES (?, ?, ?, ?)').run(
    projectId,
    SETTING_KEY,
    json,
    new Date().toISOString(),
  )
}

/** getHarnessMemory —  */
export function getHarnessMemory(db: Database.Database): HarnessMemoryState | null {
  const projectId = getProjectId(db)
  const row = db
    .prepare('SELECT value FROM project_settings WHERE project_id = ? AND key = ?')
    .get(projectId, SETTING_KEY) as { value: string } | undefined

  if (!row) return null

  try {
    return JSON.parse(row.value) as HarnessMemoryState
  } catch {
    return null
  }
}
