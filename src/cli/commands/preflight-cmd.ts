/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { runPreflight, deriveTopic } from '../../core/preflight/preflight.js'
import { realGitProbe, makeGraphProbe } from '../../core/preflight/preflight-adapters.js'

const log = createLogger({ layer: 'cli', source: 'preflight-cmd.ts' })

/**
 * `agf preflight [topic]` — the golden rule as a command. Before starting work,
 * inspect git history (branch, ahead/behind, dirty, stash, topic-matching
 * commits) AND the graph (existing nodes on the same topic + current WIP), then
 * return a verdict so the driver avoids duplicating in-flight or shipped work.
 */
export function preflightCommand(): Command {
  log.info('preflight command registered')
  return new Command('preflight')
    .description('Golden-rule guard: git-history + graph dedupe before implementing (zero MCP, ~0 token)')
    .argument('[topic]', 'Tópico/título do trabalho a iniciar (usado p/ dedupe). Default: título de --node')
    .option('--node <id>', 'Node alvo: exclui a si mesmo do dedupe e deriva o tópico do título')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((topicArg: string | undefined, opts: { node?: string; dir: string }) => {
      const out = createCliOutput('preflight')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const node = opts.node ? store.getNodeById(opts.node) : null
        const topic = deriveTopic(topicArg, node?.title ?? null)

        const report = runPreflight({
          topic,
          cwd: opts.dir,
          nodeId: opts.node,
          git: realGitProbe,
          graph: makeGraphProbe(store),
        })

        // A blocking verdict yields ok:false so wrappers (agf start / autopilot)
        // can halt; informational verdicts return ok:true with the same payload.
        if (report.verdict === 'wip-conflict' || report.verdict === 'duplicate-risk') {
          out.fail(
            report.verdict === 'wip-conflict' ? 'WIP_CONFLICT' : 'DUPLICATE_RISK',
            `Preflight: ${report.verdict}`,
            report,
          )
        } else {
          out.ok(report)
        }
      } finally {
        store.close()
      }
    })
}
