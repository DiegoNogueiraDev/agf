/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { detectLargeTasks } from '../../core/planner/decompose.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'decompose-cmd.ts' })

/** Builds the `agf decompose` CLI command (Commander definition). */
export function decomposeCommand(): Command {
  log.info('decompose command registered')
  return new Command('decompose')
    .description('Detecta tasks grandes demais e sugere subtasks atômicas (anti-one-shot)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('decompose')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const doc = store.toGraphDocument()
        const results = detectLargeTasks(doc)
        out.ok({
          candidates: results.map((r) => ({
            nodeId: r.node.id,
            title: r.node.title,
            reasons: r.reasons,
            suggestedSubtasks: r.suggestedSubtasks.map((s) => ({
              title: s.title,
              estimateMinutes: s.estimateMinutes,
            })),
          })),
        })
      } finally {
        store.close()
      }
    })
}
