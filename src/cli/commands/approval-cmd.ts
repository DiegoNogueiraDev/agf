/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { ApprovalTokenLedger } from '../../core/approval/approval-token.js'
import { ApprovalTimeoutError, waitForApproval } from '../../core/approval/signal-file-watcher.js'
import { createCliOutput } from '../shared/cli-output.js'

/** Builds the `agf approval` CLI command (Commander definition). */
export function approvalCommand(): Command {
  const cmd = new Command('approval').description(
    'Approval token lifecycle (create → grant → verify → consume/revoke, delegation chain)',
  )

  cmd
    .command('check <policy> <action> <grantedBy> <grantedTo>')
    .description(
      'Run the full lifecycle of an approval token in one call: create → grant → verify → consume (or --revoke)',
    )
    .option('--revoke', 'Revoke the granted token instead of consuming it', false)
    .action((policy: string, action: string, grantedBy: string, grantedTo: string, opts: { revoke: boolean }) => {
      const out = createCliOutput('approval.check')
      const ledger = new ApprovalTokenLedger()
      const created = ledger.create({ policy, action, grantedBy, grantedTo })
      ledger.grant(created.id)

      if (opts.revoke) {
        const revoked = ledger.revoke(created.id)
        out.ok({ token: revoked })
        return
      }

      const verified = ledger.verify(created.id, action, {})
      const consumed = ledger.consume(created.id, action)
      const reuseBlocked = !ledger.consume(created.id, action)
      out.ok({ token: created, verified, consumed, reuseBlocked })
    })

  cmd
    .command('wait <taskId>')
    .description(
      'Poll `.workflow-approvals/<taskId>.json` for a human-dropped {approved:true} signal file; blocks until approved or timeout',
    )
    .option('--dir <dir>', 'Base directory for signal files')
    .option('--timeout-ms <ms>', 'Total timeout in ms', (v) => Number.parseInt(v, 10))
    .option('--interval-ms <ms>', 'Poll interval in ms', (v) => Number.parseInt(v, 10))
    .action(async (taskId: string, opts: { dir?: string; timeoutMs?: number; intervalMs?: number }) => {
      const out = createCliOutput('approval.wait')
      try {
        await waitForApproval({ taskId, dir: opts.dir, timeoutMs: opts.timeoutMs, intervalMs: opts.intervalMs })
        out.ok({ taskId, approved: true })
      } catch (e) {
        if (e instanceof ApprovalTimeoutError) {
          out.fail('APPROVAL_TIMEOUT', e.message, { taskId })
          return
        }
        throw e
      }
    })

  return cmd
}
