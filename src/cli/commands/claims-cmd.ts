/*!
 * agf claims — read-only visibility of active agent lease claims.
 *
 * WHY: agents coordinating on one graph need to see who holds what without
 * hitting the full swarm command. This is a lightweight inspection surface
 * over the resource_locks table.
 *
 * Composes with: LockManager (lock-manager.ts), openStoreOrFail (open-store.ts).
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { listActiveClaims, sweepExpiredClaims } from '../../core/store/lock-manager.js'
import { createCliOutput } from '../shared/cli-output.js'

/** Builds the `agf claims` CLI command. */
export function claimsCommand(): Command {
  return new Command('claims')
    .description('List active agent lease claims on graph tasks (read-only)')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--sweep', 'Sweep expired leases and return count', false)
    .action((opts: { dir: string; sweep: boolean }) => {
      const out = createCliOutput('claims')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        if (opts.sweep) {
          const swept = sweepExpiredClaims(store.getDb())
          out.ok({ swept })
          return
        }
        const claims = listActiveClaims(store.getDb())
        out.ok({ claims, count: claims.length })
      } finally {
        store.close()
      }
    })
}
