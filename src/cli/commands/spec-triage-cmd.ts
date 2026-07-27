/*!
 * agf spec triage — triage orphan spec-nodes (requirement/interface/contract).
 *
 * WHY: spec-nodes without implementers or consumers accumulate silently; this command
 * surfaces them with actionable applyVia commands (promote → task + edge, close → archive).
 * Mirrors risk-triage-cmd.ts for spec types.
 *
 * Composes with: spec-triage.ts (core logic), open-store.ts (SqliteStore).
 */

import { Command } from 'commander'
import { createCliOutput } from '../shared/cli-output.js'
import { openStoreOrFail } from '../open-store.js'
import { triageSpecNodes } from '../../core/risk/spec-triage.js'
import { backfillSatisfiedSpecs } from '../../core/graph/spec-close-on-done.js'

/** `spec-triage close-satisfied` — drain legacy backlog specs whose work is done. */
function specCloseSatisfiedCommand(): Command {
  return new Command('close-satisfied')
    .description('Satisfy backlog spec-nodes whose parent/implementers are already done (backfill close-on-done)')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--commit', 'Persist the transitions (default: dry-run preview)', false)
    .action((opts: { dir: string; commit: boolean }) => {
      const out = createCliOutput('spec-triage')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        if (!opts.commit) {
          // Dry-run: count candidates without mutating (re-open in-memory copy is overkill;
          // we report what a commit WOULD close by inspecting the graph read-only).
          const doc = store.toGraphDocument()
          const statusById = new Map(doc.nodes.map((n) => [n.id, n.status]))
          const PARENT = new Set(['acceptance_criteria', 'constraint', 'decision', 'formula'])
          const candidates = doc.nodes.filter(
            (n) => n.status === 'backlog' && PARENT.has(n.type) && n.parentId && statusById.get(n.parentId) === 'done',
          ).length
          out.ok({ dryRun: true, wouldClose: candidates })
          return
        }
        const result = backfillSatisfiedSpecs(store)
        out.ok({ committed: true, closed: result.closed.length })
      } finally {
        store.close()
      }
    })
}

export function specTriageCommand(): Command {
  const cmd = new Command('triage')
    .description('Triage orphan spec-nodes (requirement/interface/contract without implementers)')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--promote <id>', 'Promote spec to a implementing task + edge')
    .option('--close <id>', 'Archive an invalid/resolved spec-node')
    .option('--commit', 'Apply mutations (default: dry-run)', false)
    .option('--select <path>', 'Dot-path filter on data')
    .action(async (opts: { dir: string; promote?: string; close?: string; commit: boolean }) => {
      const out = createCliOutput('spec.triage')
      const store = await openStoreOrFail(opts.dir, { requireExisting: true })

      const dryRun = !opts.commit

      const result = triageSpecNodes(store, {
        dryRun,
        promote: opts.promote ? [opts.promote] : [],
        close: opts.close ? [opts.close] : [],
      })

      out.ok({ dryRun, ...result })
    })

  return cmd
}

export function specTriageParentCommand(): Command {
  const cmd = new Command('spec-triage').description('Spec-node triage commands')
  cmd.addCommand(specTriageCommand())
  cmd.addCommand(specCloseSatisfiedCommand())
  return cmd
}
