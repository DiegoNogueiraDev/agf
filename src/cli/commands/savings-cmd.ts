/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * `savings` — exibe tabela cumulativa de economia de tokens.
 */
import { Command } from 'commander'
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
