/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Centralized store path resolution for global/local/explicit modes.
 *
 * Resolution precedence:
 * 1. --db flag / MCP_GRAPH_DB env (explicit)
 * 2. {cwd}/workflow-graph/graph.db (local — backward compat)
 * 3. ~/.mcp-graph/graph.db (global — default)
 */

import path from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { createDatabase } from './database-factory.js'
import { STORE_DIR, DB_FILE, GLOBAL_DB_DIR } from '../utils/constants.js'
import { configureDb, runMigrations } from './migrations.js'
import { createLogger } from '../utils/logger.js'
import { McpGraphError } from '../utils/errors.js'

const log = createLogger({ layer: 'core', source: 'path-resolver.ts' })

export type StoreMode = 'local' | 'global' | 'explicit'

export interface ResolvedStore {
  /** How the DB was resolved */
  mode: StoreMode
  /** Absolute path to the graph.db file */
  dbPath: string
  /** Project root directory (for code index, PRD, etc.) */
  basePath: string
  /** Absolute path to memories directory */
  memoriesPath: string
}

export interface ResolveOptions {
  /** Explicit DB path override (--db flag or MCP_GRAPH_DB env) */
  explicitDb?: string
  /** Current working directory (defaults to process.cwd()) */
  cwd?: string
  /** Global store directory (defaults to ~/.mcp-graph/) — injectable for tests */
  globalDir?: string
  /** Project ID for global memories scoping */
  projectId?: string
  /** If true, creates global DB when no DB exists anywhere. Default: false */
  createGlobal?: boolean
}

/**
 * Resolve which store DB to use based on precedence rules.
 *
 * @throws {Error} If no DB can be found and createGlobal is false.
 */
/** Resolve which store DB to use based on precedence rules. */
export function resolveStorePath(options?: ResolveOptions): ResolvedStore {
  const cwd = options?.cwd ?? process.cwd()
  const globalDir = options?.globalDir ?? GLOBAL_DB_DIR
  const createGlobal = options?.createGlobal ?? false

  // 1. Explicit mode: --db flag or MCP_GRAPH_DB env
  if (options?.explicitDb) {
    log.debug('path-resolver:explicit', { dbPath: options.explicitDb })
    return {
      mode: 'explicit',
      dbPath: options.explicitDb,
      basePath: cwd,
      memoriesPath: resolveMemoriesDir('explicit', cwd, globalDir, options.projectId),
    }
  }

  // 2. Local mode: {cwd}/workflow-graph/graph.db
  const localDbPath = path.join(cwd, STORE_DIR, DB_FILE)
  if (existsSync(localDbPath)) {
    log.debug('path-resolver:local', { dbPath: localDbPath })
    return {
      mode: 'local',
      dbPath: localDbPath,
      basePath: cwd,
      memoriesPath: resolveMemoriesDir('local', cwd, globalDir, options?.projectId),
    }
  }

  // 3. Global mode: ~/.mcp-graph/graph.db
  const globalDbPath = path.join(globalDir, DB_FILE)
  if (existsSync(globalDbPath)) {
    log.debug('path-resolver:global', { dbPath: globalDbPath })
    return {
      mode: 'global',
      dbPath: globalDbPath,
      basePath: cwd,
      memoriesPath: resolveMemoriesDir('global', cwd, globalDir, options?.projectId),
    }
  }

  // 4. No DB found — create global if requested
  if (createGlobal) {
    log.info('path-resolver:create-global', { globalDir })
    mkdirSync(globalDir, { recursive: true })
    // Bug #057: ensure db.close() even if configureDb/runMigrations throw
    const db = createDatabase(globalDbPath)
    try {
      configureDb(db)
      runMigrations(db)
    } finally {
      db.close()
    }

    return {
      mode: 'global',
      dbPath: globalDbPath,
      basePath: cwd,
      memoriesPath: resolveMemoriesDir('global', cwd, globalDir, options?.projectId),
    }
  }

  throw new McpGraphError(
    `No graph database found. Checked:\n` +
      `  local:  ${localDbPath}\n` +
      `  global: ${globalDbPath}\n` +
      `Run 'mcp-graph init' to create a local store, or 'mcp-graph init --global' for a global one.`,
  )
}

/**
 * Resolve the memories directory based on mode.
 * - local: {cwd}/workflow-graph/memories/
 * - global: {globalDir}/memories/{projectId}/
 * - explicit: same as local (basePath)
 */
function resolveMemoriesDir(mode: StoreMode, basePath: string, globalDir: string, projectId?: string): string {
  if (mode === 'global' && projectId) {
    return path.join(globalDir, 'memories', projectId)
  }
  if (mode === 'global') {
    return path.join(globalDir, 'memories')
  }
  // local or explicit
  return path.join(basePath, STORE_DIR, 'memories')
}
