/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { sequenceSubtasks } from '../../core/graph/auto-sequence.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'sequence-cmd.ts' })

/** Builds the `agf sequence` CLI command (Commander definition). */
export function sequenceCommand(): Command {
  log.info('sequence command registered')
  return new Command('sequence')
    .description("Auto-sequence a parent's children into a depends_on chain, ordered by createdAt (WIP=1 enforcement)")
    .argument('<parentId>', 'ID of the parent node whose children to sequence')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((parentId: string, opts: { dir: string }) => {
      const out = createCliOutput('sequence')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const node = store.getNodeById(parentId)
        if (!node) {
          out.err('NOT_FOUND', `Node não encontrado: ${parentId}`)
          return
        }
        const result = sequenceSubtasks(store, parentId)
        out.ok({
          parentId,
          edgesCreated: result.edgesCreated,
          chain: result.chain,
        })
      } finally {
        store.close()
      }
    })
}
