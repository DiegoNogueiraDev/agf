/*!
 * reclassify-structural-cmd — agf reclassify-structural CLI command.
 *
 * WHY: Exposes reclassifyStructural — retroactively flags PRD-imported
 * task/epic/subtask nodes whose titles match structural-heading heuristics
 * (e.g. "TIER A — ...", "Sequenciamento (4 sprints)") as
 * metadata.implementable=false, so they're excluded from auto-ready
 * candidate detection (agf insights auto-ready, wired earlier this session)
 * and other implementable-task logic. Report-only by default; --apply
 * mutates via the real store.updateNode.
 *
 * Composes with: reclassify-structural.ts (core), insights/auto-ready.ts
 * (sibling consumer of the same metadata.implementable flag).
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { reclassifyStructural } from '../../core/planner/reclassify-structural.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'reclassify-structural-cmd.ts' })

/** Builds the `agf reclassify-structural` CLI command (Commander definition). */
export function reclassifyStructuralCommand(): Command {
  log.info('reclassify-structural command registered')
  return new Command('reclassify-structural')
    .description(
      'Reclassifica nodes com título estrutural (TIER X, Roadmap, Sequenciamento...) como implementable=false',
    )
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--apply', 'Aplica de verdade (grava metadata.implementable=false)', false)
    .action((opts: { dir: string; apply: boolean }) => {
      const out = createCliOutput('reclassify-structural')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        out.ok(reclassifyStructural(store.toGraphDocument(), store, { apply: opts.apply }))
      } finally {
        store.close()
      }
    })
}
