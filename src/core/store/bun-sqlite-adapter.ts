/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Adapter: presents Bun's built-in `bun:sqlite` with the subset of the
 * `better-sqlite3` API that agf relies on, so the same code runs under Node
 * (better-sqlite3) and inside a Bun standalone binary (`bun:sqlite`).
 *
 * Why: `better-sqlite3` loads its native `.node` via the `bindings` package,
 * which walks the filesystem for `package.json` — that fails inside Bun's
 * virtual `/$bunfs/` root of a compiled executable. `bun:sqlite` is built into
 * the Bun runtime and embeds cleanly, enabling a self-contained binary.
 *
 * Surface covered (everything agf uses): prepare()/.run/.get/.all/.iterate,
 * exec(), pragma(), transaction(), close(), and the `name`/`open` props. No
 * custom SQLite aggregates/functions are used by agf, so none are shimmed.
 */

import { createRequire } from 'node:module'

// Loaded via createRequire so tsc/Node bundling never try to resolve `bun:sqlite`.
// Under Bun this returns the built-in module synchronously.
const req = createRequire(import.meta.url)

/** Minimal shape of a better-sqlite3 statement that agf consumes. */
interface BsqliteStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
  iterate(...params: unknown[]): IterableIterator<unknown>
}

/**
 * better-sqlite3 binds named params from a bare-key object (`{name: v}` for
 * `@name`/`:name`/`$name`). bun:sqlite is strict about the prefix, so when the
 * sole argument is a plain object, expand it to all three prefixes — harmless
 * extra keys are ignored by SQLite, and whichever the SQL uses resolves.
 */
function normalizeParams(params: unknown[]): unknown[] {
  if (params.length !== 1) return params
  const p = params[0]
  if (p === null || typeof p !== 'object' || Array.isArray(p) || p instanceof Uint8Array) return params
  const obj = p as Record<string, unknown>
  const expanded: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    const bare = k.replace(/^[@:$]/, '')
    expanded[bare] = v
    expanded[`@${bare}`] = v
    expanded[`:${bare}`] = v
    expanded[`$${bare}`] = v
  }
  return [expanded]
}

function wrapStatement(stmt: BsqliteStatement): BsqliteStatement {
  return {
    run: (...params) => stmt.run(...normalizeParams(params)),
    get: (...params) => stmt.get(...normalizeParams(params)),
    all: (...params) => stmt.all(...normalizeParams(params)),
    iterate: (...params) => stmt.iterate(...normalizeParams(params)),
  }
}

/** Create a better-sqlite3-compatible handle backed by bun:sqlite. */
export function createBunSqliteAdapter(filename: string, options?: { readonly?: boolean }): unknown {
  const { Database } = req('bun:sqlite') as {
    Database: new (
      f: string,
      o?: { readonly?: boolean; create?: boolean },
    ) => {
      prepare(sql: string): BsqliteStatement
      exec(sql: string): void
      query(sql: string): BsqliteStatement
      transaction(fn: (...a: unknown[]) => unknown): (...a: unknown[]) => unknown
      close(): void
    }
  }
  const db = new Database(filename, { readonly: options?.readonly ?? false, create: !options?.readonly })

  const handle = {
    name: filename,
    open: true,
    prepare(sql: string): BsqliteStatement {
      return wrapStatement(db.prepare(sql))
    },
    exec(sql: string): void {
      db.exec(sql)
    },
    /**
     * better-sqlite3 `.pragma('k = v')` sets; `.pragma('k')` reads (returns rows).
     * Route sets through exec and reads through query.
     */
    pragma(source: string): unknown {
      if (source.includes('=')) {
        db.exec(`PRAGMA ${source}`)
        return undefined
      }
      return db.query(`PRAGMA ${source}`).all()
    },
    transaction(fn: (...a: unknown[]) => unknown): (...a: unknown[]) => unknown {
      return db.transaction(fn)
    },
    close(): void {
      handle.open = false
      db.close()
    },
  }
  return handle
}
