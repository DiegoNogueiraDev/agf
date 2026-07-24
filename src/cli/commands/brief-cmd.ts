/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import {
  buildEnrichedBrief,
  renderBriefMarkdown,
  renderBriefPrompt,
  validateBriefReady,
} from '../../core/context/executor-brief.js'
import { getPrefetchedContext } from '../../core/planner/prefetch-next-context.js'

const log = createLogger({ layer: 'cli', source: 'brief-cmd.ts' })

const FORMATS = ['markdown', 'json', 'claude-prompt'] as const
type BriefFormat = (typeof FORMATS)[number]

/** Builds the `agf brief` CLI command (Commander definition). */
export function briefCommand(): Command {
  log.info('brief command registered')
  return new Command('brief')
    .description('Generate the delegation brief (ExecutorBrief spec) for a task node — markdown | json | claude-prompt')
    .argument('<id>', 'ID do nó a transformar em brief de execução')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--format <fmt>', `Formato de saída: ${FORMATS.join(' | ')}`, 'markdown')
    .option('--draft', 'Bypass the readiness gate and emit the brief even with unfilled judgment fields')
    .action(async (id: string, opts: { dir: string; format: string; draft?: boolean }) => {
      const out = createCliOutput('brief')
      if (!FORMATS.includes(opts.format as BriefFormat)) {
        out.err('INVALID_FORMAT', 'use markdown | json | claude-prompt')
        return
      }
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        // §node_cc4c4c7e02e2 — prefetch cache check: se o brief da task
        // solicitada está no cache, serve sem re-computar.
        const cached = getPrefetchedContext(store, id)
        if (cached && cached.brief) {
          const promo = cached.brief
          switch (opts.format as BriefFormat) {
            case 'json':
              out.ok({ cached: true, brief: promo, nodeId: id })
              break
            case 'claude-prompt':
              out.ok({ cached: true, prompt: promo, nodeId: id })
              break
            case 'markdown':
            default:
              out.ok({ cached: true, markdown: promo, nodeId: id })
              break
          }
          return
        }

        const brief = await buildEnrichedBrief(store, id, { projectDir: opts.dir })
        if (brief === null) {
          out.err('NOT_FOUND', `Node "${id}" não encontrado no grafo`)
          return
        }
        const { ready, unfilled } = validateBriefReady(brief)
        if (!ready && !opts.draft) {
          out.fail('BRIEF_NOT_READY', `Brief has unfilled <fill:> fields: ${unfilled.join(', ')}`, { unfilled })
          return
        }
        if (!ready && opts.draft) {
          out.advisory('BRIEF_DRAFT', `Brief emitted in draft mode with unfilled fields: ${unfilled.join(', ')}`, {
            task: brief,
            unfilled,
          })
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
