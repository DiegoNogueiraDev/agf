/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Single chokepoint for opening a SQLite database. Under Node it uses the
 * native `better-sqlite3`; inside a Bun runtime/standalone binary it uses the
 * built-in `bun:sqlite` via {@link createBunSqliteAdapter} (better-sqlite3's
 * `bindings` loader cannot resolve its `.node` inside Bun's `/$bunfs/` root).
 *
 * Both deps are loaded with `createRequire` (synchronous, no static import) so
 * the Bun bundler never pulls `better-sqlite3`/`bindings`, and `tsc`/Node never
 * resolve `bun:sqlite`. The returned handle is API-compatible with the
 * better-sqlite3 surface agf uses, so the 130+ `import type Database` callers
 * stay unchanged.
 */

import { createRequire } from 'node:module'
import type BetterSqlite3 from 'better-sqlite3'
import { createBunSqliteAdapter } from './bun-sqlite-adapter.js'
import { checkSlowQuery, getSlowQueryThreshold } from './slow-query-detector.js'
import { createLogger } from '../utils/logger.js'

export type DbHandle = BetterSqlite3.Database
export type DbOptions = BetterSqlite3.Options

/** True when running under the Bun runtime (including a compiled standalone binary). */
export const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'

const req = createRequire(import.meta.url)
const log = createLogger({ layer: 'core', source: 'database-factory.ts' })

type ExecMethod = 'run' | 'get' | 'all'
const TIMED_METHODS: ExecMethod[] = ['run', 'get', 'all']

/**
 * §EPIC-12.T09 wire — every statement executed through this handle is timed;
 * slow-query-detector's pure decision (checkSlowQuery) decides whether to
 * warn. Wraps at the single DB-open chokepoint so none of the 130+ existing
 * `db.prepare(sql).run()/.get()/.all()` call sites need to change.
 */
function withSlowQueryDetection(db: DbHandle): DbHandle {
  const threshold = getSlowQueryThreshold()
  const originalPrepare = db.prepare.bind(db)
  db.prepare = ((sql: string, ...prepareArgs: unknown[]) => {
    const stmt = (originalPrepare as (...a: unknown[]) => BetterSqlite3.Statement)(sql, ...prepareArgs)
    for (const method of TIMED_METHODS) {
      const original = (stmt[method] as (...a: unknown[]) => unknown).bind(stmt)
      ;(stmt as unknown as Record<ExecMethod, (...a: unknown[]) => unknown>)[method] = (...params: unknown[]) => {
        const start = Date.now()
        const result = original(...params)
        const report = checkSlowQuery({ sql, durationMs: Date.now() - start, params, thresholdMs: threshold })
        if (report.slow) {
          log.warn('slow-query', {
            sqlPreview: report.sqlPreview,
            durationMs: report.durationMs,
            thresholdMs: report.thresholdMs,
            paramTypes: report.paramTypes,
          })
        }
        return result
      }
    }
    return stmt
  }) as typeof db.prepare
  return db
}

/**
 * Open (or create) a SQLite database with the right engine for the runtime.
 * Drop-in replacement for `new Database(filename, options)`.
 */
export function createDatabase(filename: string, options?: DbOptions): DbHandle {
  if (isBunRuntime) {
    return createBunSqliteAdapter(filename, { readonly: options?.readonly }) as unknown as DbHandle
  }
  // better-sqlite3 is CJS: module.exports IS the constructor.
  const BetterSqlite3 = req('better-sqlite3') as new (filename: string, options?: DbOptions) => DbHandle
  return withSlowQueryDetection(new BetterSqlite3(filename, options))
}
