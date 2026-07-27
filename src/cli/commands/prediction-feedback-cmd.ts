/*!
 * prediction-feedback-cmd — agf prediction-feedback CLI command.
 *
 * WHY: Exposes feedback-loop.ts's createFeedbackStore — records wrong
 * predictions + their corrections (query/wrongPrediction/correction), so a
 * future agent can search past mistakes before repeating one (ACT-R
 * interference avoidance). Distinct from `agf feedback` (submitFeedback,
 * external bug/improvement/feature reports to the product team) — this is
 * an internal, local learning-loop memory, not product feedback.
 *
 * Composes with: feedback-loop.ts (core, self-migrating SQLite table).
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { createFeedbackStore } from '../../core/learning/feedback-loop.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'prediction-feedback-cmd.ts' })

/** Builds the `agf prediction-feedback` CLI command (Commander definition). */
export function predictionFeedbackCommand(): Command {
  log.info('prediction-feedback command registered')
  const cmd = new Command('prediction-feedback')
    .description('Loop de correção de previsões erradas — busca por erros passados antes de repeti-los')
    .enablePositionalOptions()

  const dirOpt = (c: Command): Command => c.option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())

  dirOpt(
    cmd
      .command('record <query> <wrongPrediction> <correction>')
      .description('Registra uma previsão errada e sua correção')
      .option('--context <text>', 'Contexto adicional (opcional)'),
  ).action((query: string, wrongPrediction: string, correction: string, opts: { dir: string; context?: string }) => {
    const out = createCliOutput('prediction-feedback.record')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const fb = createFeedbackStore(store.getDb())
      const id = fb.record({ query, wrongPrediction, correction, context: opts.context })
      out.ok({ id })
    } finally {
      store.close()
    }
  })

  dirOpt(cmd.command('list').description('Lista todos os registros de correção')).action((opts: { dir: string }) => {
    const out = createCliOutput('prediction-feedback.list')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const fb = createFeedbackStore(store.getDb())
      out.ok({ records: fb.list() })
    } finally {
      store.close()
    }
  })

  dirOpt(
    cmd
      .command('search <query>')
      .description('Busca correções passadas por substring (query/correction)')
      .option('--limit <n>', 'Máximo de resultados', '10'),
  ).action((query: string, opts: { dir: string; limit: string }) => {
    const out = createCliOutput('prediction-feedback.search')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const fb = createFeedbackStore(store.getDb())
      out.ok({ records: fb.search(query, Number(opts.limit)) })
    } finally {
      store.close()
    }
  })

  return cmd
}
