/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * `agf backfill-provenance` — attributes untracked `source_file` gaps by
 * inheriting from the closest ancestor along `parent_of` edges. Thin CLI
 * wrapper over src/core/harness/provenance-backfill-store.ts (the harness
 * "provenance" dimension's own remediation tool — see harness-cmd.ts's
 * --violations advice for when a project scores low here).
 */

import { Command } from 'commander'
import { applyProvenanceBackfill } from '../../core/harness/provenance-backfill-store.js'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'backfill-provenance-cmd.ts' })

/** Builds the `agf backfill-provenance` CLI command (Commander definition). */
export function backfillProvenanceCommand(): Command {
  log.info('backfill-provenance command registered')
  return new Command('backfill-provenance')
    .description('Attribute nodes missing source_file by inheriting the closest ancestor along parent_of edges')
    .option('-d, --dir <dir>', 'Project root directory', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('backfill-provenance')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const summary = applyProvenanceBackfill(store.getDb())
        out.ok(summary)
      } finally {
        store.close()
      }
    })
}
