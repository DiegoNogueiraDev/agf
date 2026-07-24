/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { RealWorkspaceStateService } from '../../core/services/workspace-state.js'
import { createCliOutput } from '../shared/cli-output.js'

/** Builds the `agf workspace` CLI command (Commander definition). */
export function workspaceCommand(): Command {
  const cmd = new Command('workspace').description(
    'Workspace state lifecycle (snapshot/track/restore/revert/diff) via WorkspaceStateService',
  )

  cmd
    .command('snapshot <label>')
    .description('Track files, create a snapshot, and optionally restore or revert it in the same call')
    .option('--track <paths>', 'Comma-separated file paths to track before snapshotting')
    .option('--restore', 'Attempt to restore the snapshot just created')
    .option('--revert', 'Revert the snapshot just created')
    .action((label: string, opts: { track?: string; restore?: boolean; revert?: boolean }) => {
      const out = createCliOutput('workspace.snapshot')
      const service = new RealWorkspaceStateService()
      for (const path of (opts.track ?? '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)) {
        service.track(path)
      }
      const snapshot = service.snapshot(label)
      const restored = opts.restore ? service.restore(snapshot.id) : undefined
      const reverted = opts.revert ? service.revert(snapshot.id) : undefined
      out.ok({ snapshot, restored, reverted, all: service.listSnapshots() })
    })

  cmd
    .command('diff <fromLabel> <toLabel>')
    .description('Create two snapshots (fromLabel, toLabel) and diff them')
    .action((fromLabel: string, toLabel: string) => {
      const out = createCliOutput('workspace.diff')
      const service = new RealWorkspaceStateService()
      const from = service.snapshot(fromLabel)
      const to = service.snapshot(toLabel)
      out.ok({ from, to, diff: service.diff(from.id, to.id) })
    })

  return cmd
}
