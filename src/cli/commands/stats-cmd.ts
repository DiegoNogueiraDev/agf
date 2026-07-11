/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { separateWorkStats } from '../../core/graph/stats-work-types.js'

const log = createLogger({ layer: 'cli', source: 'stats-cmd.ts' })

/** Builds the `agf stats` CLI command (Commander definition). */
export function statsCommand(): Command {
  log.info('stats command registered')
  return new Command('stats')
    .description('Mostra contagens do grafo persistente (nodes/edges por tipo e status)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('stats')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const stats = store.getStats()
        const { backlogWork, specNodes } = separateWorkStats(stats)
        out.ok({ ...stats, backlogWork, specNodes })
      } finally {
        store.close()
      }
    })
}
