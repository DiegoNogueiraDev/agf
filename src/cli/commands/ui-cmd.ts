/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { startProgressServer } from '../../core/web/progress-server.js'
import { resolveIdleShutdownMs, createIdleWatcher } from '../../core/daemon/idle-config.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'ui-cmd.ts' })

/** Builds the `agf ui` CLI command (Commander definition). */
export function uiCommand(): Command {
  log.debug('ui command registered')
  return new Command('ui')
    .description('Web mínima de progresso (grafo + tokens + logs ao vivo) numa porta custom')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('-p, --port <n>', 'Porta (default 4555; cai p/ efêmera se ocupada)', '4555')
    .action(async (opts: { dir: string; port: string }) => {
      const out = createCliOutput('ui')
      const store = openStoreOrFail(opts.dir)
      const shutdown = (): void => {
        idleWatcher?.stop()
        void server.close().then(() => {
          store.close()
          process.exit(0)
        })
      }
      const idleWatcher = createIdleWatcher(resolveIdleShutdownMs(process.env.MCP_DAEMON_IDLE_MS), shutdown)
      const server = await startProgressServer(store, {
        port: parseInt(opts.port, 10) || 4555,
        onRequest: () => idleWatcher?.touch(),
      })
      out.ok({ url: server.url, hint: 'Ctrl+C para parar' })
      process.on('SIGINT', shutdown)
      process.on('SIGTERM', shutdown)
    })
}
