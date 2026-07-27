/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreIfExists } from '../open-store.js'
import { collectStatus } from '../shared/status-report.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'status-cmd.ts' })

/** Builds the `agf status` CLI command (Commander definition). */
export function statusCommand(): Command {
  log.info('status command registered')
  return new Command('status')
    .description('Painel: provider/modelo/cache + tokens/$ + economia (visão única)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('status')
      const store = openStoreIfExists(opts.dir)
      if (!store) {
        out.ok({ project: null }, { count: 0 })
        return
      }
      try {
        out.ok(collectStatus(store))
      } finally {
        store.close()
      }
    })
}
