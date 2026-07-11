/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { runDreamCycle, dreamStatus, dreamHistory, cancelDreamCycle } from '../../core/economy/dream-service.js'

/** Builds the `agf dream` CLI command (Commander definition). */
export function dreamCommand(): Command {
  const cmd = new Command('dream').description(
    'REM-inspired knowledge consolidation cycles (start/status/history/cancel)',
  )

  cmd
    .command('start')
    .description('Start a complete dream cycle (NREM → REM → Boost)')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('dream')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const cycle = runDreamCycle(store)
        out.ok(cycle)
      } finally {
        store.close()
      }
    })

  cmd
    .command('status')
    .description('Show current (latest) dream cycle status')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('dream')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const status = dreamStatus(store.getDb())
        out.ok(status ?? null)
      } finally {
        store.close()
      }
    })

  cmd
    .command('history')
    .description('Show past dream cycles')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('-l, --limit <n>', 'Number of cycles to show', '10')
    .action((opts: { dir: string; limit: string }) => {
      const out = createCliOutput('dream')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const cycles = dreamHistory(store.getDb(), parseInt(opts.limit, 10) || 10)
        out.ok(cycles)
      } finally {
        store.close()
      }
    })

  cmd
    .command('cancel')
    .description('Cancel any running dream cycle')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('dream')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const cancelled = cancelDreamCycle(store.getDb())
        out.ok({ cancelled })
      } finally {
        store.close()
      }
    })

  return cmd
}
