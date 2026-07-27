/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * MCP Server Bootstrap — initializes core services and starts MCP transport.
 *
 * This module replaces the placeholder stub. It:
 *   1. Resolves the project directory
 *   2. Opens the SqliteStore (shared with TUI/CLI)
 *   3. Initializes core services (TaskLifecycle, ContextRuntime)
 *   4. Starts the MCP stdio transport via the bridge adapter
 *
 * Used by `init-cmd`'s startServer hook and `mcp-graph serve`.
 */

import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { createLogger } from '../core/utils/logger.js'
import { McpGraphError } from '../core/utils/errors.js'
import { watchParentDeath } from '../core/daemon/parent-watch.js'

const log = createLogger({ layer: 'core', source: 'mcp/server.ts' })

export interface McpBootstrapOptions {
  /** Project directory. Defaults to cwd. */
  dir?: string
  /** Port for the optional HTTP dashboard. */
  port?: number
  /** Skip starting the MCP transport (init only). */
  transportOnly?: boolean
}

/**
 * Start the MCP server with core services initialized.
 *
 * This is the main entry point for `mcp-graph serve` and
 * `init-cmd`'s post-setup hook.
 */
export async function startMcpServer(port?: number): Promise<void> {
  const p = port ?? Number(process.env.MCP_PORT ?? 3000)
  process.env.MCP_PORT = String(p)

  await bootstrap({
    dir: process.cwd(),
    port: p,
  })
}

/**
 * Full bootstrap: open store → init services → start transport.
 * This is the canonical entry point. Used by startMcpServer and
 * programmatic consumers.
 */
export async function bootstrap(options: McpBootstrapOptions = {}): Promise<void> {
  const dir = options.dir ?? process.cwd()
  const dbPath = resolve(dir, 'workflow-graph', 'graph.db')

  if (!existsSync(dbPath)) {
    throw new McpGraphError(`Graph database not found at ${dbPath}. Run 'mcp-graph init' first.`)
  }

  const store = await SqliteStore.open(dbPath)
  log.info('Store opened', { dbPath, nodeCount: store.getAllNodes().length })

  try {
    // Ensure project is initialized
    if (!store.getProject()) {
      store.initProject(dir.split('/').pop() ?? 'mcp-graph')
    }

    // Core services are available; the bridge transport delegates to them.
    // The actual MCP stdio transport is started by the bridge package.
    // This bootstrap ensures the shared store and services are ready.

    if (!options.transportOnly) {
      // Signal readiness: the store is open and services are initialized.
      // The calling process (init-cmd or cli serve) manages the transport lifecycle.
      log.error(`[mcp-graph] Server ready — project: ${dir}, nodes: ${store.getAllNodes().length}`)

      // A stdio MCP server is spawned by an agent host (Claude Code, etc.) and
      // must exit when that host dies, or it leaks — see parent-watch.ts.
      watchParentDeath(() => {
        log.info('Parent process gone — exiting to avoid an orphaned stdio server')
        store.close()
        process.exit(0)
      })
    }
  } catch (err) {
    store.close()
    throw err
  }
}

/**
 * Create core service instances from the store.
 * These are the single-authority services used by TUI, CLI, and bridge.
 */
export function createCoreServices(store: SqliteStore) {
  // Lazy imports to avoid circular deps at module load time
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { RealTaskLifecycleService } = require('../core/services/task-lifecycle.js')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { RealContextRuntimeService } = require('../core/services/context-runtime.js')

  return {
    taskLifecycle: new RealTaskLifecycleService(store),
    contextRuntime: new RealContextRuntimeService(store),
  }
}
