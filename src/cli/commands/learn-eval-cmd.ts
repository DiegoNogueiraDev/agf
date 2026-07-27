/*!
 * agf learn-eval — CLI command for the learning-precision evaluation report.
 *
 * WHY: exposes the LearningPrecisionReport (accuracy, regret, Brier, ECE,
 * precisionScore, meetsTarget) to the CLI with the standard JSON envelope and
 * --select support. The pure computation lives in learn-eval-assembler.ts,
 * making it testable without Commander wiring.
 *
 * Composes with: learn-eval-assembler.ts (pure), sqlite-learning-store.ts
 *   (data), open-store.ts (CLI store access), cli-output.ts (envelope).
 */

import { Command } from 'commander'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { openStoreOrFail } from '../open-store.js'
import { SqliteLearningStore } from '../../core/learning/sqlite-learning-store.js'
import { assembleLearnEval } from '../../core/learning/learn-eval-assembler.js'

const log = createLogger({ layer: 'cli', source: 'learn-eval-cmd.ts' })

/** Builds the `agf learn-eval` CLI command. */
export function learnEvalCommand(): Command {
  log.info('learn-eval command registered')
  return new Command('learn-eval')
    .description('Relatório de precisão do aprendizado ACO/bandit (accuracy, regret, Brier, ECE, precisionScore)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('learn-eval')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const learningStore = new SqliteLearningStore(store)
        const report = assembleLearnEval(learningStore)
        out.ok(report)
      } catch (err) {
        out.err('LEARN_EVAL_ERROR', err instanceof Error ? err.message : String(err))
      }
    })
}
