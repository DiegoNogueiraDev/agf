/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { buildEnrichedBrief, renderBriefMarkdown, renderBriefPrompt } from '../../core/context/executor-brief.js'

const log = createLogger({ layer: 'cli', source: 'brief-cmd.ts' })

const FORMATS = ['markdown', 'json', 'claude-prompt'] as const
type BriefFormat = (typeof FORMATS)[number]

/** Builds the `agf brief` CLI command (Commander definition). */
export function briefCommand(): Command {
  log.info('brief command registered')
  return new Command('brief')
    .description('Render the ExecutorBrief (delegation spec) for a node — markdown | json | claude-prompt')
    .argument('<id>', 'ID do nó a transformar em brief de execução')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--format <fmt>', `Formato de saída: ${FORMATS.join(' | ')}`, 'markdown')
    .action(async (id: string, opts: { dir: string; format: string }) => {
      const out = createCliOutput('brief')
      if (!FORMATS.includes(opts.format as BriefFormat)) {
        out.err('INVALID_FORMAT', 'use markdown | json | claude-prompt')
        return
      }
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const brief = await buildEnrichedBrief(store, id, { projectDir: opts.dir })
        if (brief === null) {
          out.err('NOT_FOUND', `Node "${id}" não encontrado no grafo`)
          return
        }
        switch (opts.format as BriefFormat) {
          case 'json':
            out.ok(brief)
            break
          case 'claude-prompt':
            out.ok({ prompt: renderBriefPrompt(brief) })
            break
          case 'markdown':
          default:
            out.ok({ markdown: renderBriefMarkdown(brief) })
            break
        }
      } finally {
        store.close()
      }
    })
}
