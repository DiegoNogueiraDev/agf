/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { StoreManager } from '../../core/store/store-manager.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'recent-cmd.ts' })

/** Builds the `agf recent` CLI command (Commander definition). */
export function recentCommand(): Command {
  log.info('recent command registered')
  return new Command('recent')
    .description('Lista pastas de projeto recentemente usadas (histórico de StoreManager.swap)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('recent')
      const manager = StoreManager.create(opts.dir)
      try {
        out.ok({ folders: manager.recentFolders, file: manager.recentFilePath })
      } finally {
        manager.close()
      }
    })
}
