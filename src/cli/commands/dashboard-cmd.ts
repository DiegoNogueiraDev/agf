/*!
 * agf dashboard — start the web dashboard (Vite SPA + /api/v1) for this project.
 *
 * WHY: Decouples the dashboard from `agf init`; users can start the dashboard
 * without re-running initialization. Serves the built React SPA
 * (src/web/dashboard) with two tabs — Graph and Economy — backed by the live
 * store via the Express API in src/api.
 *
 * Composes with: dashboard-runner.ts (testable DI logic), api/app-factory.ts
 *               (Express app + server), open-browser.ts, open-store.ts.
 */

import { Command } from 'commander'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createCliOutput } from '../shared/cli-output.js'
import { createLogger } from '../../core/utils/logger.js'
import { openStoreOrFail } from '../open-store.js'
import { startDashboardServer } from '../../api/app-factory.js'
import { openBrowser, shouldSkipAutoOpen } from '../../core/web/open-browser.js'
import { runDashboardCommand } from '../../core/web/dashboard-runner.js'
import { attachBrowserHarnessBridge, attachSqliteEventBridge } from '../../core/hooks/shared-hook-bus.js'

const log = createLogger({ layer: 'cli', source: 'dashboard-cmd.ts' })

export function dashboardCommand(): Command {
  log.info('dashboard command registered')
  return new Command('dashboard')
    .description('Start the agf web dashboard (Graph + Economy SPA + /api/v1)')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('-p, --port <port>', 'Port for the dashboard server', '3000')
    .option('--no-open', 'Do not auto-open the browser')
    .action(async (opts: { dir: string; port: string; open: boolean }) => {
      const out = createCliOutput('dashboard')
      const dir = path.resolve(opts.dir)
      const port = parseInt(opts.port, 10)
      if (isNaN(port) || port < 1 || port > 65535) {
        out.err('INVALID_PORT', `Invalid port: ${opts.port}`)
        return
      }
      const store = openStoreOrFail(dir, { requireExisting: true })
      attachBrowserHarnessBridge(store.getDb()) // persists browser-harness test.* events to the events table
      attachSqliteEventBridge(store.getDb(), randomUUID()) // cross-terminal event propagation via event_queue polling
      try {
        const result = await runDashboardCommand({
          port,
          noOpen: opts.open === false,
          startServer: async (p) => {
            const handle = await startDashboardServer(store, { port: p, host: '127.0.0.1' })
            return handle.url
          },
          openInBrowser: (url) => {
            if (shouldSkipAutoOpen({ env: process.env, isTty: Boolean(process.stdout.isTTY) })) return
            openBrowser(url)
          },
        })
        if (result.ok) {
          out.ok(result.data)
        } else {
          out.err('DASHBOARD_FAILED', result.error)
        }
      } finally {
        // Server stays alive — do not close store
      }
    })
}
