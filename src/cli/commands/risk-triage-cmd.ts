/*!
 * agf risk triage — triage open risk nodes: promote, accept, close.
 *
 * WHY: risk nodes accumulate from woodpecker/honesty stubs; this command
 * lets operators act on them without leaving permanent noise in the graph.
 *
 * Composes with: risk-triage.ts (core logic), open-store.ts (SqliteStore).
 */

import { Command } from 'commander'
import { createCliOutput } from '../shared/cli-output.js'
import { openStoreOrFail } from '../open-store.js'
import { triageRisks } from '../../core/risk/risk-triage.js'

export function riskTriageCommand(): Command {
  const cmd = new Command('triage')
    .description('Triage open risk nodes (dry-run by default)')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--promote <id>', 'Promote risk to a mitigating task')
    .option('--accept <id>', 'Accept a risk (requires --reason)')
    .option('--reason <txt>', 'Reason for accepting a risk')
    .option('--close <id>', 'Archive an invalid/resolved risk')
    .option('--commit', 'Apply mutations (default: dry-run)', false)
    .option('--select <path>', 'Dot-path filter on data')
    .action(
      async (opts: {
        dir: string
        promote?: string
        accept?: string
        reason?: string
        close?: string
        commit: boolean
      }) => {
        const out = createCliOutput('risk.triage')
        const store = await openStoreOrFail(opts.dir, { requireExisting: true })

        const dryRun = !opts.commit

        const acceptList = opts.accept ? [{ id: opts.accept, reason: opts.reason ?? '' }] : []

        const result = triageRisks(store, {
          dryRun,
          promote: opts.promote ? [opts.promote] : [],
          accept: acceptList,
          close: opts.close ? [opts.close] : [],
        })

        out.ok({ dryRun, ...result })
      },
    )

  return cmd
}

export function riskCommand(): Command {
  const cmd = new Command('risk').description('Risk management commands')
  cmd.addCommand(riskTriageCommand())
  return cmd
}
