/*!
 * knowledge-lint-cmd — agf knowledge-lint CLI command.
 * Task node_0db2e3d7a9b3.
 *
 * WHY: Exposes lintKnowledge as a CLI tool for agent pipelines and CI.
 * Returns a standard ok:true JSON envelope with findings, scanned, deleted.
 * Never mutates the store (deleted is always 0).
 *
 * Composes with: knowledge-lint.ts (core), heal-cmd.ts (mutating sibling).
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { lintKnowledge } from '../../core/knowledge/knowledge-lint.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'knowledge-lint-cmd.ts' })

/** Builds the `agf knowledge-lint` CLI command. */
export function knowledgeLintCommand(): Command {
  log.info('knowledge-lint command registered')
  return new Command('knowledge-lint')
    .description('Lint read-only do knowledge store (findings sem deleção)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--json', 'Força saída em JSON envelope')
    .action((opts: { dir: string; json?: boolean }) => {
      const out = createCliOutput('knowledge-lint')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const result = lintKnowledge(store.getDb())
        out.ok(result)
      } finally {
        store.close()
      }
    })
}
