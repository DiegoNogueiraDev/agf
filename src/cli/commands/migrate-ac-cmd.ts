/*!
 * migrate-ac CLI command — collapses legacy acceptance_criteria child nodes into
 * parent task.ac[] and soft-archives them. Dry-run by default.
 *
 * WHY: graphs created before the prd-to-graph AC fix may carry redundant AC child nodes.
 * This one-shot command reconciles them idempotently without data loss.
 *
 * Composes with: migrate-ac.ts (core), open-store.ts (CLI store access).
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { migrateAcNodes } from '../../core/importer/migrate-ac.js'

/** Builds the `agf migrate-ac` CLI command (Commander definition). */
export function migrateAcCommand(): Command {
  return new Command('migrate-ac')
    .description('Fold legacy acceptance_criteria child nodes into parent task.ac[] (dry-run by default)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--commit', 'Apply migration (default is dry-run)', false)
    .action((opts: { dir: string; commit: boolean }) => {
      const out = createCliOutput('migrate-ac')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const result = migrateAcNodes(store, { commit: opts.commit })
        out.ok({ ...result, mode: opts.commit ? 'commit' : 'dry-run' })
      } finally {
        store.close()
      }
    })
}
