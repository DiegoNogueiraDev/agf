/*!
 * agf wire-dormant — converts dormant core capabilities into WIRE-tasks.
 *
 * Dry-run by default. Use --commit to persist the tasks into the graph.
 * Deduplicates against existing wire-dormant tasks so re-runs are idempotent.
 */

import { Command } from 'commander'
import { buildDormantReport } from '../../core/harness/dormant-report.js'
import { buildWireTasks } from '../../core/harness/wire-dormant-ingest.js'
import {
  checkConnectivityRegression,
  isConnectivityGuardDisabled,
} from '../../core/hooks/connectivity-regression-guard.js'
import { openStoreOrFail } from '../open-store.js'

const BASELINE_KEY = 'connectivity_dormant_baseline'
import { createCliOutput } from '../shared/cli-output.js'

/** Builds the `agf wire-dormant` CLI command. */
export function wireDormantCommand(): Command {
  return new Command('wire-dormant')
    .description('List dormant capabilities and optionally inject WIRE-tasks into the backlog')
    .option('-d, --dir <dir>', 'Project root directory', process.cwd())
    .option('--commit', 'Persist WIRE-tasks into the graph (default: dry-run)', false)
    .option('--allowlist <paths>', 'Comma-separated module paths to skip (intentionally dormant)', '')
    .option('--gate', 'Fail (exit 1) if dormant count grew vs the stored baseline; else ratchet baseline down', false)
    .action((opts: { dir: string; commit: boolean; allowlist: string; gate: boolean }) => {
      const out = createCliOutput('wire-dormant')

      const allowlist = opts.allowlist
        ? opts.allowlist
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : []

      const dormantReport = buildDormantReport({ rootDir: opts.dir, allowlist })

      // --gate: connectivity-regression guard (the "quem dispara" enforcement).
      // Blocks dormancy from creeping back up; ratchets the baseline down on
      // improvement so gains (e.g. the LLM-stack deletion) can't silently regress.
      if (opts.gate) {
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const current = dormantReport.dormant.length
          const stored = store.getProjectSetting(BASELINE_KEY)
          const baseline = stored === null ? current : Number.parseInt(stored, 10)
          const result = checkConnectivityRegression({
            baselineDormantCount: Number.isFinite(baseline) ? baseline : current,
            currentDormantCount: current,
            baselineDormantFiles: undefined,
            currentDormantFiles: undefined,
            disabled: isConnectivityGuardDisabled(),
          })
          if (result.regression) {
            out.fail(
              'CONNECTIVITY_REGRESSION',
              `Dormância subiu: ${baseline} → ${current} (+${result.newDormant}). Wire ou allowlist antes de prosseguir (AGF_CONNECTIVITY_GUARD=0 desliga).`,
              { baseline, current, newDormant: result.newDormant },
            )
            return
          }
          // No regression → ratchet the baseline down to the (lower-or-equal) current.
          store.setProjectSetting(BASELINE_KEY, String(current))
          out.ok({ gate: 'pass', baseline, current, skipped: result.skipped ?? false })
        } finally {
          store.close()
        }
        return
      }

      const existingModules = new Set<string>()
      if (opts.commit) {
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          for (const node of store.toGraphDocument().nodes) {
            const meta = node.metadata as { source?: string; dormantModule?: string } | undefined
            if (meta?.source === 'wire-dormant' && typeof meta.dormantModule === 'string') {
              existingModules.add(meta.dormantModule)
            }
          }

          const result = buildWireTasks({
            dormant: dormantReport.dormant,
            existingModules,
            allowlist,
            dryRun: false,
          })

          for (const task of result.tasks) {
            store.insertNode(task)
          }

          out.ok({
            dormant: dormantReport.dormant,
            tasks: result.tasks.map((t) => ({ id: t.id, title: t.title })),
            skipped: result.skipped,
            committed: result.committed,
          })
        } finally {
          store.close()
        }
        return
      }

      // Dry-run: preview only
      const result = buildWireTasks({
        dormant: dormantReport.dormant,
        existingModules,
        allowlist,
        dryRun: true,
      })

      out.ok({
        dormant: dormantReport.dormant,
        tasks: result.tasks.map((t) => ({ id: t.id, title: t.title })),
        skipped: result.skipped,
        committed: false,
      })
    })
}
