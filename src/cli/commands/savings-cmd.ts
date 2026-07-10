/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * `savings` — exibe tabela cumulativa de economia de tokens.
 */
import { Command } from 'commander'
import { baselineMethodMix, savingsBySession, summarizeAttribution } from '../../core/economy/attribution.js'
import { openStoreOrFail } from '../open-store.js'
import {
  getCumulativeSavings,
  resetSavings,
  assertMinSavings,
  getSavingsByCommand,
} from '../../core/economy/savings-tracker.js'
import { summarizePilotLedger } from '../../core/observability/pilot-ledger.js'
import { buildProofSnapshot } from '../../core/economy/proof-snapshot.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'savings-cmd.ts' })

/** Builds the `agf savings` CLI command (Commander definition). */
export function savingsCommand(): Command {
  log.info('savings command registered')
  return new Command('savings')
    .description('Tabela cumulativa de economia de tokens (tok_in, tok_out, tok_cache, cost)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--reset', 'Reseta o acumulador de savings')
    .option('--assert-min <tokens>', 'CI gate: exits non-zero when totalSaved < N tokens', Number)
    .option('--by-command', 'Mostra saving% por comando (caller) com flag de baixo desempenho')
    .action((opts: { dir: string; reset?: boolean; assertMin?: number; byCommand?: boolean }) => {
      const out = createCliOutput('savings')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        if (opts.reset) {
          resetSavings(store)
          out.ok({ action: 'reset' })
          return
        }
        if (opts.byCommand) {
          const rows = getSavingsByCommand(store.getDb())
          out.ok({ byCommand: rows })
          return
        }
        const report = getCumulativeSavings(store, opts.dir)
        const pilot = summarizePilotLedger(store.getDb())

        if (opts.assertMin !== undefined) {
          const assertion = assertMinSavings(report.totalSaved, opts.assertMin)
          if (!assertion.pass) {
            out.fail(
              'ASSERT_MIN_SAVINGS',
              `totalSaved ${assertion.actual} < required ${assertion.threshold}`,
              assertion,
            )
            process.exitCode = 1
            return
          }
          out.ok({ ...assertion, totalSaved: report.totalSaved })
          return
        }

        const proof = buildProofSnapshot(store)

        out.ok({
          ...report,
          // `totalSaved` is a difference against a baseline, not an observed cost delta: agf makes
          // no LLM calls in delegate mode, so nothing was billed to compare against. Some rows are
          // measured (`measured_fallback`: the tokens `agf help` really emitted), some estimated
          // (`structural`: a constant someone chose). A flat label over a mixed ledger would lie,
          // so the envelope carries the mix and lets the reader weigh it.
          baselineMethods: baselineMethodMix(store.getDb()),
          // `totalSaved` alone cannot say who earned it. A lever that fires while a task is in
          // progress belongs to that task; one that fires with nothing in progress belongs to
          // nothing, and that is what a benchmark run looks like from the ledger's side.
          attribution: summarizeAttribution(store.getDb()),
          // "How much did this sitting save?" — the question an agent asks when it finishes, and
          // one a ledger whose session_id was always `'cli'` could not answer.
          bySession: savingsBySession(store.getDb()),
          pilotEconomy: pilot.calls > 0 ? pilot : undefined,
          byCommand: proof.byCommand,
          scaffoldReuse: proof.scaffoldReuse,
          baselineExtrapolated: proof.totals.baselineExtrapolated,
          ...(proof.totals.baselineExtrapolated ? { baselineNote: '(est.)' } : {}),
        })
      } finally {
        store.close()
      }
    })
}
