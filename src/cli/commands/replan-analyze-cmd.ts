/*!
 * replan-analyze-cmd — agf replan-analyze CLI command.
 *
 * WHY: Exposes analyzeReplanSuggest (§EPIC-dynamic-replanning Task 1.3) —
 * detects sprint-health issues (cycle-time divergence >50% from estimate,
 * ≥3 tasks blocked by the same parent) and proposes reprioritize/
 * break_dependency actions. Sibling of agf cycle-repair (Task 1.2, wired
 * earlier this session) in the same dynamic-replanning epic. Report-only —
 * proposals are suggestions for a human/agent to act on, not auto-applied.
 *
 * Composes with: replan-analyzer.ts (core, reads node_changelog for real
 * cycle-time data).
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { analyzeReplanSuggest } from '../../core/planner/replan-analyzer.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'replan-analyze-cmd.ts' })

/** Builds the `agf replan-analyze` CLI command (Commander definition). */
export function replanAnalyzeCommand(): Command {
  log.info('replan-analyze command registered')
  return new Command('replan-analyze')
    .description('Analisa saúde do sprint (cycle-time divergence, parent-blocking) e propõe replanejamento')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--sprint <name>', 'Filtra por sprint')
    .action((opts: { dir: string; sprint?: string }) => {
      const out = createCliOutput('replan-analyze')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        out.ok(analyzeReplanSuggest(store.toGraphDocument(), store.getDb(), opts.sprint ?? null))
      } finally {
        store.close()
      }
    })
}
