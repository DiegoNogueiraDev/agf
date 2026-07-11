/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { claimNextTask } from '../../core/planner/claim-next-task.js'
import { LockManager } from '../../core/store/lock-manager.js'
import { getColonySignals } from '../../core/colony/colony-signals.js'
import { selectNextTaskSmart, readTunedAcoAlpha } from '../../core/planner/aco-select.js'
import { resolveAcoMode } from '../../core/planner/aco-mode.js'
import { makeSeededPrng } from '../../core/utils/seeded-prng.js'
import { detectHardBlocks, HARD_BLOCK_RULES } from '../../core/planner/hard-block-detector.js'
import { enumerateExternalBlocks } from '../../core/planner/external-blocker.js'
import { detectAvailableRuntimes, defaultRuntimeProbe } from '../../core/planner/available-runtimes.js'
import { sweepStaleLeases } from '../../core/planner/sweep-stale-leases.js'
import { resolveAgentId } from '../../core/planner/resolve-agent-id.js'
import { randomUUID } from 'node:crypto'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'next-cmd.ts' })

/** Builds the `agf next` CLI command (Commander definition). */
export function nextCommand(): Command {
  log.info('next command registered')
  return new Command('next')
    .description('Puxa a próxima task desbloqueada (pull system, WIP=1) — fase BUILD')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--aco', 'Opt into ACO roulette (pheromone-weighted) selection instead of strict priority')
    .option('--no-aco', 'Force the deterministic priority sort (default; explicit for clarity)')
    .option('--seed <n>', 'Seed the ACO roulette RNG for reproducible --aco selection (default: non-deterministic)')
    .option(
      '--pierce-containers',
      'Treat container epics (no own AC, all children in backlog) as transparent — expose child tasks regardless of parent status',
    )
    .option(
      '--agent <id>',
      'Multi-agent mode: atomically claim the picked task with a lease for this agent id (skips tasks contended by others)',
    )
    .option('--lease-ttl <seconds>', 'Lease TTL in seconds for --agent claims (default 300)')
    .option(
      '--force',
      'Bypass WIP=1 guard and pull the next backlog task even if one is already in_progress (emits WIP_OVERRIDE warning)',
    )
    .action(
      (opts: {
        dir: string
        aco?: boolean
        seed?: string
        pierceContainers?: boolean
        agent?: string
        leaseTtl?: string
        force?: boolean
      }) => {
        const out = createCliOutput('next')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          // Auto-sweep expired leases so freed tasks are immediately pullable.
          sweepStaleLeases(store.getDb())

          const doc = store.toGraphDocument()

          // Multi-agent mode: atomic lease-based claim so N agents never double-pull.
          // Bypasses the single-agent WIP advisory — each agent's WIP is its own lease.
          // node_wire_7d739490fe72 — resolveAgentId centralizes flag > AGF_AGENT_ID env
          // > generated-uuid. Only enters this branch when flag or env is set, so the
          // default (neither set) stays byte-identical to before: claim path skipped.
          if (opts.agent || process.env.AGF_AGENT_ID) {
            const agentId = resolveAgentId(opts.agent, process.env.AGF_AGENT_ID, () => randomUUID())
            const ttlSeconds = opts.leaseTtl ? Number(opts.leaseTtl) : undefined
            const claimed = claimNextTask(doc, new LockManager(store.getDb()), agentId, {
              pierceContainers: opts.pierceContainers,
              ttlSeconds,
            })
            if (!claimed) {
              out.fail('NO_TASKS', 'Nenhuma task desbloqueada e não-reivindicada disponível.', {
                reason: 'all_claimed_or_blocked',
              })
              return
            }
            const signals = getColonySignals(store.getStats())
            const data: Record<string, unknown> = {
              node: claimed.node,
              reason: claimed.reason,
              claim: claimed.claim,
              suggested_model: signals.suggested_model,
              caste: signals.caste,
            }
            if (claimed.warning) data.warning = claimed.warning
            out.ok(data)
            return
          }

          const inProgress = doc.nodes.filter((n) => n.status === 'in_progress')
          if (inProgress.length > 0) {
            if (opts.force) {
              // --force: bypass WIP guard, pull next backlog task, emit WIP_OVERRIDE warning
              log.warn('next:wip-override', { existingId: inProgress[0]!.id })
            } else {
              // Idempotent pull: return the existing in_progress task rather than an error.
              // This lets an agent that restarts re-claim its own live task without manual cleanup.
              const signals = getColonySignals(store.getStats())
              out.ok({
                node: inProgress[0]!,
                reason: 'wip-idempotent',
                warning: 'WIP_LIMIT: returning existing in_progress task; use --force to pull a new one',
                suggested_model: signals.suggested_model,
                caste: signals.caste,
              })
              return
            }
          }

          // Strict priority is the default: --aco forces on (roulette), --no-aco forces off
          // (same as the default, kept for clarity), neither flag → off. --seed makes the
          // roulette reproducible when --aco is used. All selection logic lives in
          // selectNextTaskSmart (DRY with start-cmd).
          const mode = resolveAcoMode({ aco: opts.aco === true, noAco: opts.aco === false })
          const rng = opts.seed !== undefined ? makeSeededPrng(Number(opts.seed)) : Math.random
          const result = selectNextTaskSmart(doc, {
            getDb: () => store.getDb(),
            getProjectId: () => store.getProject()?.id ?? '',
            mode,
            rng,
            pierceContainers: opts.pierceContainers,
            alpha: () => readTunedAcoAlpha(store), // GA-tuned α when the autotune lever has learned one (T6c)
          })
          if (result?.reason === 'aco-roulette') log.info('next:aco-selected', { nodeId: result.node.id })
          if (!result) {
            const tasks = doc.nodes.filter((n) => n.type === 'task' || n.type === 'subtask')
            let reason: string
            if (tasks.length === 0) {
              reason = 'empty_graph'
            } else if (tasks.every((n) => n.blocked)) {
              reason = 'all_explicitly_blocked'
            } else {
              reason = 'all_deps_pending'
            }
            // Explain *why* a non-empty backlog is stuck: tasks whose required external
            // runtime/corpus is absent are hard-blocked (delegate-safe — pure env probe,
            // no provider). Surfaces the loop-stuck-without-reason gap that left agents blind.
            const requiredRuntimes = [...new Set(HARD_BLOCK_RULES.map((r) => r.requiredRuntime))]
            const available = detectAvailableRuntimes([...requiredRuntimes, 'node'], defaultRuntimeProbe)
            const hardBlocks = tasks.length > 0 ? detectHardBlocks(tasks, available) : []
            // Distinguish infra/external blockers (proxy, K8s, Vault, SSH push)
            // from code deps across the whole graph, so a stuck loop can queue
            // the human/infra action instead of fabricating work.
            const externalBlocks = enumerateExternalBlocks(doc.nodes)
            out.fail('NO_TASKS', 'Nenhuma task disponível para puxar.', {
              reason,
              ...(hardBlocks.length > 0 ? { hardBlocks } : {}),
              ...(externalBlocks.length > 0 ? { externalBlocks } : {}),
            })
            return
          }
          const signals = getColonySignals(store.getStats())
          const data: Record<string, unknown> = {
            node: result.node,
            reason: result.reason,
            suggested_model: signals.suggested_model,
            caste: signals.caste,
          }
          if (result.warning) data.warning = result.warning
          if (opts.force && inProgress.length > 0)
            data.warning = `WIP_OVERRIDE: pulled new task while ${inProgress[0]!.id} is still in_progress`
          out.ok(data)
        } finally {
          store.close()
        }
      },
    )
}
