/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type Database from 'better-sqlite3'
import { createDatabase } from './database-factory.js'
import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'db-recovery.ts' })

/**
 * Run PRAGMA integrity_check on the database at dbPath.
 * Returns true if the database passes the check, false on any error or corruption.
 */
export function checkDbIntegrity(dbPath: string): boolean {
  if (!existsSync(dbPath)) return false
  let db: Database.Database | null = null
  try {
    db = createDatabase(dbPath)
    const row = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string } | undefined
    return row?.integrity_check === 'ok'
  } catch {
    return false
  } finally {
    try {
      db?.close()
    } catch (err) {
      log.debug('db-recovery:close-ignored', { error: String(err) })
    }
  }
}

/**
 * Run PRAGMA integrity_check on an already-open Database instance.
 * Returns { ok: true, issues: [] } on a healthy DB,
 * or { ok: false, issues: string[] } listing all corruption messages.
 * Used by createSnapshot before persisting a backup.
 */
export function checkDbIntegrityForSnapshot(db: Database.Database): { ok: boolean; issues: string[] } {
  try {
    const rows = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>
    const issues = rows.map((r) => r.integrity_check).filter((v) => v !== 'ok')
    return { ok: issues.length === 0, issues }
  } catch (err) {
    return { ok: false, issues: [String(err)] }
  }
}

/**
 * Copy dbPath into backupDir with a timestamp-based filename.
 * Creates backupDir if it does not exist.
 * Returns the absolute path of the created backup file.
 */
export function createBackup(dbPath: string, backupDir: string): string {
  mkdirSync(backupDir, { recursive: true })
  const ext = path.extname(dbPath)
  const base = path.basename(dbPath, ext)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  // Fixed-width, zero-padded monotonic suffix so backups created within the same
  // millisecond still sort chronologically by name. (A `.slice(-6)` here loses
  // monotonicity when the low digits roll over, making restoreLastBackup pick the
  // older backup — an intermittent failure.)
  const nano = process.hrtime.bigint().toString().padStart(22, '0')
  const backupName = `${base}-${timestamp}-${nano}${ext}`
  const backupPath = path.join(backupDir, backupName)
  copyFileSync(dbPath, backupPath)
  log.debug('Backup created', { dbPath, backupPath })
  return backupPath
}

/**
 * Restore the most recent backup from backupDir onto dbPath.
 * Returns true if a backup was found and restored, false if backupDir is empty.
 */
export function restoreLastBackup(dbPath: string, backupDir: string): boolean {
  if (!existsSync(backupDir)) return false
  const files = readdirSync(backupDir).sort()
  if (files.length === 0) return false
  const latest = path.join(backupDir, files[files.length - 1])
  copyFileSync(latest, dbPath)
  log.info('DB restored from backup', { dbPath, source: latest })
  return true
}

/**
 * Keep only the most recent maxCount backups in backupDir, deleting older ones.
 */
export function rotateBackups(backupDir: string, maxCount = 3): void {
  if (!existsSync(backupDir)) return
  const files = readdirSync(backupDir).sort()
  if (files.length <= maxCount) return
  const toDelete = files.slice(0, files.length - maxCount)
  for (const filename of toDelete) {
    try {
      unlinkSync(path.join(backupDir, filename))
    } catch (err) {
      log.warn('Failed to delete old backup', { filename, error: err instanceof Error ? err.message : String(err) })
    }
  }
}
