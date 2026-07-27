/*!
 * knowledge-learn-cmd — agf knowledge-learn CLI command.
 *
 * WHY: Exposes learnFromProject (cross-project-learner.ts) as a CLI tool —
 * imports knowledge (memories/AI-decisions/ADRs/patterns) from another
 * project's graph.db into this project's knowledge store. Reuses the
 * existing exportKnowledge/importKnowledge round trip; adds no new schema.
 *
 * Composes with: cross-project-learner.ts (core), knowledge-lint-cmd.ts (sibling).
 */

import { Command } from 'commander'
import path from 'node:path'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { learnFromProject } from '../../core/knowledge/cross-project-learner.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'knowledge-learn-cmd.ts' })

/** Builds the `agf knowledge-learn` CLI command. */
export function knowledgeLearnCommand(): Command {
  log.info('knowledge-learn command registered')
  return new Command('knowledge-learn')
    .description("Importa conhecimento (memories/decisions/patterns) de outro projeto's graph.db")
    .argument('<sourceDir>', 'Diretório do projeto de origem (contém workflow-graph/graph.db)')
    .option('-d, --dir <dir>', 'Diretório do projeto de destino', process.cwd())
    .option('--categories <list>', 'Categorias a importar (errors,estimates,adrs,templates,patterns), CSV')
    .option('--min-quality <n>', 'Qualidade mínima do documento (0-1)', '0.4')
    .option('--max-docs <n>', 'Máximo de documentos importados', '100')
    .action(
      async (sourceDir: string, opts: { dir: string; categories?: string; minQuality: string; maxDocs: string }) => {
        const out = createCliOutput('knowledge-learn')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const sourceDbPath = path.join(path.resolve(sourceDir), 'workflow-graph', 'graph.db')
          const result = await learnFromProject(store.getDb(), opts.dir, sourceDbPath, {
            categories: opts.categories?.split(',').map((c) => c.trim()),
            minQuality: Number(opts.minQuality),
            maxDocs: Number(opts.maxDocs),
          })
          out.ok({ ...result, sourceProject: sourceDir })
        } finally {
          store.close()
        }
      },
    )
}
