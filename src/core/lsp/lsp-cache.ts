/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type Database from 'better-sqlite3'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'lsp-cache.ts' })

/**
 * SQLite-backed cache for LSP results with mtime-based invalidation.
 *
 * Each entry is keyed by (project_id, cache_key) and stores the JSON-serialized
 * result alongside the file's mtime at cache time. A `get()` that receives a
 * different mtime than what was stored is treated as a cache miss.
 */
export class LspCache {
  constructor(private readonly db: Database.Database) {
    this.ensureTable()
  }

  /* ------------------------------------------------------------------ */
  /*  DDL — table + indexes                                              */
  /* ------------------------------------------------------------------ */

  /** Create the lsp_cache table if not exists (for standalone usage outside migration). */
  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lsp_cache (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id      TEXT NOT NULL,
        cache_key       TEXT NOT NULL,
        operation       TEXT NOT NULL,
        language_id     TEXT NOT NULL,
        file_path       TEXT NOT NULL,
        result_json     TEXT NOT NULL,
        file_mtime      TEXT NOT NULL,
        created_at      TEXT NOT NULL,
        UNIQUE(project_id, cache_key)
      );

      CREATE INDEX IF NOT EXISTS idx_lsp_cache_file ON lsp_cache(project_id, file_path);
      CREATE INDEX IF NOT EXISTS idx_lsp_cache_lang ON lsp_cache(project_id, language_id);
    `)

    log.debug('lsp-cache:ensureTable', { status: 'ok' })
  }

  /* ------------------------------------------------------------------ */
  /*  Read                                                               */
  /* ------------------------------------------------------------------ */

  /** Get cached result. Returns null if not found or file mtime changed. */
  get(projectId: string, cacheKey: string, currentMtime: string): unknown | null {
    const row = this.db
      .prepare(
        `SELECT result_json FROM lsp_cache
         WHERE project_id = ? AND cache_key = ? AND file_mtime = ?`,
      )
      .get(projectId, cacheKey, currentMtime) as { result_json: string } | undefined

    if (!row) {
      return null
    }

    return JSON.parse(row.result_json) as unknown
  }

  /* ------------------------------------------------------------------ */
  /*  Write                                                              */
  /* ------------------------------------------------------------------ */

  /** Store a result in cache. */
  set(
    projectId: string,
    cacheKey: string,
    operation: string,
    languageId: string,
    filePath: string,
    result: unknown,
    fileMtime: string,
  ): void {
    const resultJson = JSON.stringify(result)
    const createdAt = new Date().toISOString()

    this.db
      .prepare(
        `INSERT OR REPLACE INTO lsp_cache
           (project_id, cache_key, operation, language_id, file_path, result_json, file_mtime, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(projectId, cacheKey, operation, languageId, filePath, resultJson, fileMtime, createdAt)

    log.debug('lsp-cache:set', { projectId, cacheKey, operation, languageId, filePath })
  }

  /* ------------------------------------------------------------------ */
  /*  Invalidation                                                       */
  /* ------------------------------------------------------------------ */

  /** Invalidate all cache entries for a file (both entries FROM and REFERENCING the file). */
  invalidateFile(projectId: string, filePath: string): number {
    const resultValue = this.db
      .prepare(
        `DELETE FROM lsp_cache
         WHERE project_id = ? AND (file_path = ? OR result_json LIKE '%' || ? || '%')`,
      )
      .run(projectId, filePath, filePath)

    log.debug('lsp-cache:invalidateFile', { projectId, filePath, deleted: resultValue.changes })
    return resultValue.changes
  }

  /** Invalidate all cache entries for a language. */
  invalidateLanguage(projectId: string, languageId: string): number {
    const resultValue = this.db
      .prepare(`DELETE FROM lsp_cache WHERE project_id = ? AND language_id = ?`)
      .run(projectId, languageId)

    log.debug('lsp-cache:invalidateLanguage', { projectId, languageId, deleted: resultValue.changes })
    return resultValue.changes
  }

  /** Invalidate all cache entries for a project. */
  invalidateAll(projectId: string): number {
    const resultValue = this.db.prepare(`DELETE FROM lsp_cache WHERE project_id = ?`).run(projectId)

    log.debug('lsp-cache:invalidateAll', { projectId, deleted: resultValue.changes })
    return resultValue.changes
  }

  /* ------------------------------------------------------------------ */
  /*  Maintenance                                                        */
  /* ------------------------------------------------------------------ */

  /** Remove expired/old entries. Returns count of pruned rows. */
  prune(maxAgeDays: number = 7): number {
    const resultValue = this.db
      .prepare(
        `DELETE FROM lsp_cache
         WHERE created_at < datetime('now', '-' || ? || ' days')`,
      )
      .run(maxAgeDays)

    log.info('lsp-cache:prune', { maxAgeDays, pruned: resultValue.changes })
    return resultValue.changes
  }

  /* ------------------------------------------------------------------ */
  /*  Stats                                                              */
  /* ------------------------------------------------------------------ */

  /** Get cache stats: total entries, per-language, per-operation. */
  getStats(projectId: string): {
    total: number
    byLanguage: Record<string, number>
    byOperation: Record<string, number>
  } {
    const totalRow = this.db.prepare(`SELECT COUNT(*) as cnt FROM lsp_cache WHERE project_id = ?`).get(projectId) as {
      cnt: number
    }

    const langRows = this.db
      .prepare(
        `SELECT language_id, COUNT(*) as cnt FROM lsp_cache
         WHERE project_id = ? GROUP BY language_id`,
      )
      .all(projectId) as Array<{ language_id: string; cnt: number }>

    const opRows = this.db
      .prepare(
        `SELECT operation, COUNT(*) as cnt FROM lsp_cache
         WHERE project_id = ? GROUP BY operation`,
      )
      .all(projectId) as Array<{ operation: string; cnt: number }>

    const byLanguage: Record<string, number> = {}
    for (const row of langRows) {
      byLanguage[row.language_id] = row.cnt
    }

    const byOperation: Record<string, number> = {}
    for (const row of opRows) {
      byOperation[row.operation] = row.cnt
    }

    return { total: totalRow.cnt, byLanguage, byOperation }
  }
}
