/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { isDatabaseLockedError } from '../core/store/lock-error.js'
import { StoreNotFoundError } from '../core/store/store-not-found-error.js'
import { StoreCorruptError } from '../core/store/store-corrupt-error.js'
import { createLogger } from '../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'open-store.ts' })

export interface OpenStoreOptions {
  /**
   * When true, fail before SqliteStore.open() touches the filesystem if
   * `<dir>/workflow-graph/graph.db` does not exist. Use for read-only CLI
   * commands (stats, list) so they do not silently materialize an empty
   * workflow-graph/ directory in the user's cwd.
   */
  requireExisting?: boolean
}

/**
 * Open a SqliteStore for a CLI command, presenting a friendly error and
 * exiting non-zero if the database file is corrupt or (when `requireExisting`)
 * absent.
 */
export function openStoreOrFail(dir: string, opts: OpenStoreOptions = {}): SqliteStore {
  if (opts.requireExisting === true) {
    const dbPath = join(dir, 'workflow-graph', 'graph.db')
    if (!existsSync(dbPath)) {
      // Fail loud, not silently: throw so the entrypoint's fatal envelope
      // stamps STORE_NOT_FOUND instead of a bare process.exit(1) that, under
      // --quiet (auto-activated on piped/redirected stdio), leaves the
      // caller with zero output on stdout AND stderr.
      throw new StoreNotFoundError(`No agent-graph-flow project at ${dir}. Run an import to create one.`)
    }
    // A graph.db can exist in a dir that isn't genuinely this project's root
    // (e.g. a stray/legacy import, or `cd another-repo` landing on a dir that
    // happens to share the name) — that caused a real cross-project write. A
    // package.json or .git anchor confirms the dir is a real project root.
    const hasAnchor = existsSync(join(dir, 'package.json')) || existsSync(join(dir, '.git'))
    if (!hasAnchor && process.env.AGF_ALLOW_NO_ANCHOR !== '1') {
      throw new StoreNotFoundError(
        `${dir} has a workflow-graph/graph.db but no project anchor (package.json or .git) — refusing to guard ` +
          `against a possible cross-project write. Set AGF_ALLOW_NO_ANCHOR=1 to override if this is intentional.`,
      )
    }
  }
  try {
    return SqliteStore.open(dir)
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_NOTADB' || e?.code === 'SQLITE_CORRUPT') {
      // Fail loud, not silently: throw so the entrypoint's fatal envelope
      // stamps STORE_CORRUPT instead of a bare process.exit(1) that, under
      // --quiet (auto-activated on piped/redirected stdio), leaves the
      // caller with zero output on stdout AND stderr.
      throw new StoreCorruptError(
        `Database corrupt at ${dir}/workflow-graph/graph.db: ${e.message ?? 'unknown sqlite error'}. Fix: rm -rf ${dir}/workflow-graph and re-import.`,
      )
    }
    if (isDatabaseLockedError(err)) {
      // Fail loud, not empty: rethrow so the entrypoint's fatal envelope stamps
      // STORE_LOCKED (see core/store/lock-error.ts) instead of "no data".
      log.error(
        `Database locked at ${dir}/workflow-graph/graph.db — another process holds a write lock. Retry shortly.`,
      )
    }
    throw err
  }
}

/**
 * Abre o store SOMENTE se o projeto já existe — senão retorna `undefined` (sem
 * materializar `workflow-graph/`). Útil p/ comandos que querem LER settings
 * persistidos (provider/base-url/model) num dir que pode ainda não ser projeto.
 */
export function openStoreIfExists(dir: string): SqliteStore | undefined {
  const dbPath = join(dir, 'workflow-graph', 'graph.db')
  if (!existsSync(dbPath)) return undefined
  try {
    return SqliteStore.open(dir)
  } catch {
    return undefined
  }
}
