/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Migrations index — assembles the ordered migration list from per-range modules
 * and exports runMigrations + configureDb. Consumers import from this barrel; the
 * individual v*.ts files are pure data (no runtime logic).
 *
 * WHY split: the original single-file migrations.ts exceeded 3000 lines (123
 * migrations). Splitting by version range keeps each file under 800 lines while
 * preserving identical runtime behaviour (order, SQL, transaction semantics).
 */

import type Database from 'better-sqlite3'
import { createLogger } from '../../utils/logger.js'
import { GraphIntegrityError } from '../../utils/errors.js'
import type { Migration } from './v001-v020.js'
import { migrationsV001_V020 } from './v001-v020.js'
import { migrationsV021_V050 } from './v021-v050.js'
import { migrationsV051_V080 } from './v051-v080.js'
import { migrationsV081_V100 } from './v081-v100.js'
import { migrationsV101_V123 } from './v101-v123.js'

const log = createLogger({ layer: 'core', source: 'migrations/index.ts' })

/** Full ordered migration list — assembled from per-range modules. */
export const migrations: Migration[] = [
  ...migrationsV001_V020,
  ...migrationsV021_V050,
  ...migrationsV051_V080,
  ...migrationsV081_V100,
  ...migrationsV101_V123,
]

export function runMigrations(db: Database.Database): void {
  // B29 (node_ffe8d0eb034c): if data tables exist (e.g. nodes) but
  // _migrations was dropped, naively re-running migrations from v1 fails
  // with raw SqliteError ("duplicate column") that bubbles up as an
  // uncaught Node stack trace. Detect the orphaned-schema state and
  // refuse with a friendly error so the user knows to re-init or restore.
  const migrationsTableExists =
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_migrations'").get() !== undefined
  if (!migrationsTableExists) {
    const dataTableExists =
      db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='nodes'").get() !== undefined
    if (dataTableExists) {
      throw new GraphIntegrityError(
        'Database has data tables but the _migrations tracking table is missing — orphaned schema. ' +
          "Re-initialize with 'mcp-graph init' or restore from a snapshot.",
      )
    }
  }

  // Create migrations tracking table (no-op if it already exists)
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version     INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at  TEXT NOT NULL
    );
  `)

  const applied = new Set(
    db
      .prepare('SELECT version FROM _migrations')
      .all()
      .map((row) => (row as { version: number }).version),
  )

  // B30 (node_0490b58b326c): warn if the DB has migration rows for
  // versions newer than this build knows about — typical downgrade
  // scenario where an older mcp-graph runs against a newer DB. Surface
  // it instead of silently behaving as if the DB were current.
  const knownMaxVersion = migrations.reduce((m, x) => Math.max(m, x.version), 0)
  let appliedMax = 0
  for (const v of applied) appliedMax = Math.max(appliedMax, v)
  if (appliedMax > knownMaxVersion) {
    log.warn('migration:newer-db', {
      appliedMax,
      knownMaxVersion,
      message: 'Database has migrations newer than this mcp-graph build supports — possible downgrade',
    })
  }

  // Migrations that delete large amounts of data and benefit from VACUUM
  const VACUUM_AFTER_VERSIONS = new Set([10, 17, 30])
  let needsVacuum = false

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue

    log.info('migration:run', { version: migration.version, description: migration.description })
    db.transaction(() => {
      db.exec(migration.sql)
      db.prepare('INSERT INTO _migrations (version, description, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.description,
        new Date().toISOString(),
      )
    })()
    log.info('migration:ok', { version: migration.version })

    if (VACUUM_AFTER_VERSIONS.has(migration.version)) {
      needsVacuum = true
    }
  }

  // VACUUM must run outside any transaction to reclaim space after heavy deletions
  if (needsVacuum) {
    try {
      db.exec('VACUUM')
      log.info('migration:vacuum:ok')
    } catch (err) {
      log.warn('migration:vacuum:failed', { error: err instanceof Error ? err.message : String(err) })
    }
  }
}

/** Set SQLite pragmas for WAL mode, performance, and safety. */
export function configureDb(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  db.pragma('cache_size = -8000')
  db.pragma('busy_timeout = 5000')
  db.pragma('temp_store = MEMORY')
  db.pragma('mmap_size = 67108864')
}
