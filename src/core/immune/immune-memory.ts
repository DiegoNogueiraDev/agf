/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Immune Memory — persistent storage for error signatures and recovery outcomes.
 *
 * Local SQLite (per-project) keeps the per-signature immune_memory table.
 * A global JSON file at ~/.config/agf/immune-memory.json aggregates across
 * projects so the immune system can recognise familiar antigens even in
 * new repos (cross-project immunity).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type Database from 'better-sqlite3'
import type { ImmuneMemoryEntry, AntigenKind, RecoveryActionKind } from './immune-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'immune-memory.ts' })

const AGF_DIR = join(homedir(), '.config', 'agf')
const GLOBAL_FILE = join(AGF_DIR, 'immune-memory.json')

interface GlobalMemoryRecord {
  signature: string
  antigenKind: string
  file: string
  firstSeen: number
  lastSeen: number
  occurrences: number
  lastAction: string | null
  recoverySuccess: boolean
  suppressed: boolean
}

interface GlobalMemoryFile {
  updated: string
  records: GlobalMemoryRecord[]
}

/**
 * Read local immune memory from the SQLite immune_memory table.
 * Returns an empty map when the table does not exist yet.
 */
export function readLocalMemory(db: Database.Database, projectId: string): Map<string, ImmuneMemoryEntry[]> {
  const map = new Map<string, ImmuneMemoryEntry[]>()
  try {
    const rows = db
      .prepare(
        'SELECT signature, antigen_kind, file, first_seen, last_seen, occurrences, last_action, recovery_success, suppressed FROM immune_memory WHERE project_id = ? ORDER BY last_seen DESC',
      )
      .all(projectId) as Array<{
      signature: string
      antigen_kind: string
      file: string
      first_seen: number
      last_seen: number
      occurrences: number
      last_action: string | null
      recovery_success: number
      suppressed: number
    }>
    for (const row of rows) {
      const entry: ImmuneMemoryEntry = {
        signature: row.signature,
        antigenKind: row.antigen_kind as AntigenKind,
        file: row.file,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        occurrences: row.occurrences,
        lastAction: row.last_action as RecoveryActionKind | null,
        recoverySuccess: row.recovery_success === 1,
        suppressed: row.suppressed === 1,
      }
      const key = row.file
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(entry)
    }
  } catch {
    // table does not exist yet — pre-migration state
  }
  return map
}

/**
 * Upsert an immune memory entry into the local SQLite table.
 */
export function upsertLocalMemory(db: Database.Database, projectId: string, entry: ImmuneMemoryEntry): void {
  try {
    db.prepare(
      `INSERT INTO immune_memory (project_id, signature, antigen_kind, file, first_seen, last_seen, occurrences, last_action, recovery_success, suppressed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id, signature) DO UPDATE SET
         last_seen = excluded.last_seen,
         occurrences = excluded.occurrences,
         last_action = excluded.last_action,
         recovery_success = excluded.recovery_success,
         suppressed = excluded.suppressed`,
    ).run(
      projectId,
      entry.signature,
      entry.antigenKind,
      entry.file,
      entry.firstSeen,
      entry.lastSeen,
      entry.occurrences,
      entry.lastAction,
      entry.recoverySuccess ? 1 : 0,
      entry.suppressed ? 1 : 0,
    )
  } catch (err) {
    log.warn('immune-memory:upsert-failed', { error: String(err) })
  }
}

/**
 * Merge current local memory into the global cross-project immune-memory.json.
 */
export function mergeIntoGlobalMemory(db: Database.Database, projectId: string): void {
  try {
    const local = readLocalMemory(db, projectId)
    const all: ImmuneMemoryEntry[] = []
    for (const [, entries] of local) all.push(...entries)
    if (all.length === 0) return

    const global = readGlobalMemory()

    for (const entry of all) {
      const existing = global.records.find((r) => r.signature === entry.signature)
      if (existing) {
        existing.lastSeen = Math.max(existing.lastSeen, entry.lastSeen)
        existing.occurrences = Math.max(existing.occurrences, entry.occurrences)
        if (entry.lastAction) existing.lastAction = entry.lastAction
        existing.recoverySuccess = entry.recoverySuccess
      } else {
        global.records.push({
          signature: entry.signature,
          antigenKind: entry.antigenKind,
          file: entry.file,
          firstSeen: entry.firstSeen,
          lastSeen: entry.lastSeen,
          occurrences: entry.occurrences,
          lastAction: entry.lastAction,
          recoverySuccess: entry.recoverySuccess,
          suppressed: entry.suppressed,
        })
      }
    }

    writeGlobalMemory(global)
  } catch (err) {
    log.warn('immune-memory:merge-global-failed', { error: String(err) })
  }
}

function readGlobalMemory(): GlobalMemoryFile {
  if (!existsSync(GLOBAL_FILE)) {
    return { updated: new Date().toISOString(), records: [] }
  }
  try {
    return JSON.parse(readFileSync(GLOBAL_FILE, 'utf-8')) as GlobalMemoryFile
  } catch {
    return { updated: new Date().toISOString(), records: [] }
  }
}

function writeGlobalMemory(data: GlobalMemoryFile): void {
  if (!existsSync(AGF_DIR)) mkdirSync(AGF_DIR, { recursive: true })
  data.updated = new Date().toISOString()
  try {
    writeFileSync(GLOBAL_FILE, JSON.stringify(data, null, 2) + '\n', 'utf-8')
  } catch (err) {
    log.warn('immune-memory:global-write-failed', { error: String(err) })
  }
}

/**
 * Read the cross-project global immune memory.
 */
export function readGlobalMemoryEntries(): GlobalMemoryRecord[] {
  return readGlobalMemory().records
}
