/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { pruneOrphanWorktrees } from '../../core/autonomy/shadow-branch.js'
import { consolidateProjectMemories } from '../../core/memory/consolidate-memories.js'
import { recordLeverEvent } from '../../core/economy/economy-lever-ledger.js'
import { pruneExpiredTrails, pruneWeakTrails } from '../../core/economy/pheromone-store.js'
import { listMemories, deleteMemory } from '../../core/memory/index.js'
import { pruneColonyHealthSnapshots } from '../../core/colony/colony-health-history.js'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'gc.ts' })

/** Builds the `agf gc` CLI command (Commander definition). */
export function gcCommand(): Command {
  return new Command('gc')
    .description('Garbage-collect orphan ai-shadow/* worktrees and branches')
    .option('-d, --dir <dir>', 'Project directory (git root)', process.cwd())
    .option('--ttl <minutes>', 'Only reap branches older than N minutes (0 = all)', '0')
    .option('--consolidate', 'Sleep-consolidate the memory store (merge near-duplicate memories)')
    .option('--dry-run', 'With --consolidate or --pheromones: report without deleting')
    .option('--pheromones', 'Prune pheromone trails with effective_strength < 0.05')
    .action(
      async (opts: { dir: string; ttl: string; consolidate?: boolean; dryRun?: boolean; pheromones?: boolean }) => {
        const out = createCliOutput('gc')

        // Memory consolidation (opt-in `consolidation` lever) — explicit via --consolidate.
        if (opts.consolidate) {
          log.info('cli:gc:consolidate', { dir: opts.dir, dryRun: !!opts.dryRun })
          const result = await consolidateProjectMemories(opts.dir, { apply: !opts.dryRun })
          if (!opts.dryRun && result.savedTokens > 0) {
            try {
              const store = openStoreOrFail(opts.dir, { requireExisting: true })
              try {
                recordLeverEvent(store.getDb(), {
                  surface: 'internal',
                  sessionId: `gc-${Date.now()}`,
                  lever: 'consolidation',
                  tokensBefore: result.savedTokens,
                  tokensAfter: 0,
                  saved: result.savedTokens,
                  accepted: true,
                  gateOutcome: 'accepted',
                })
              } finally {
                store.close()
              }
            } catch {
              // No project store (memories-only dir) — savings still reported in the payload.
            }
          }
          out.ok(result)
          return
        }

        // §E3.2 — --pheromones: detailed report + prune trails with effective_strength < 0.05
        if (opts.pheromones) {
          const store = openStoreOrFail(opts.dir, { requireExisting: true })
          try {
            const result = pruneWeakTrails(store.getDb(), store.getProject()?.id ?? 'default', 0.05, !opts.dryRun)
            out.ok(result)
          } finally {
            store.close()
          }
          return
        }

        // Prune expired pheromone trails (weak + old)
        try {
          const store = openStoreOrFail(opts.dir, { requireExisting: false })
          if (store) {
            try {
              const pruned = pruneExpiredTrails(store.getDb(), store.getProject()?.id ?? 'default')
              if (pruned > 0) log.info('cli:gc:pheromone-pruned', { pruned })
            } finally {
              store.close()
            }
          }
        } catch {
          /* pheromone GC never blocks main GC */
        }

        // §E5.2 — Prune colony-health snapshots older than 30 days.
        // Name format: colony-health-snapshot-YYYY-MM-DD-HH-MM-SS
        try {
          const allMemories = await listMemories(opts.dir)
          const snapshots = allMemories
            .filter((m) => m.startsWith('colony-health-snapshot-'))
            .map((m) => {
              const suffix = m.slice('colony-health-snapshot-'.length) // YYYY-MM-DD-HH-MM-SS
              const [y, mo, d, h, mi, s] = suffix.split('-')
              const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`)
              return { name: m, date: isNaN(date.getTime()) ? new Date(0) : date, grade: 'A', content: '' }
            })
          const { pruned: toPrune } = pruneColonyHealthSnapshots(snapshots, 30)
          for (const name of toPrune) {
            await deleteMemory(opts.dir, name)
            log.info('cli:gc:colony-health-snapshot-pruned', { name })
          }
        } catch {
          /* snapshot GC never blocks main GC */
        }

        const ttlMinutes = parseInt(opts.ttl, 10)
        const ttlMs = Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes * 60 * 1000 : 0
        log.info('cli:gc:start', { dir: opts.dir, ttlMs })
        const result = pruneOrphanWorktrees({ cwd: opts.dir, ttlMs })
        if (result.pruned) {
          out.ok({
            pruned: true,
            reapedBranches: result.reapedBranches,
            reapedWorktrees: result.reapedWorktrees,
          })
          return
        }
        const err = result.error ?? 'unknown error'
        if (/not a git repository/i.test(err)) {
          out.err('NOT_A_GIT_REPO', 'nada para coletar (projeto não é um repositório git).')
          return
        }
        out.err('GC_FAILED', err)
      },
    )
}
