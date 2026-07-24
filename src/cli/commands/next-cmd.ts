/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { ZodError } from 'zod/v4'
import { openStoreOrFail } from '../open-store.js'
import { claimNextTask } from '../../core/planner/claim-next-task.js'
import { checkEpicEntryGate } from '../../core/gaps/entry-gate.js'
import { declaredFilesOf, claimedByOf } from '../../core/planner/next-task.js'
import { LockManager, listActiveClaims } from '../../core/store/lock-manager.js'
import { getColonySignals } from '../../core/colony/colony-signals.js'
import { selectNextTaskSmart, readTunedAcoAlpha } from '../../core/planner/aco-select.js'
import { resolveAcoMode } from '../../core/planner/aco-mode.js'
import { makeSeededPrng } from '../../core/utils/seeded-prng.js'
import { detectHardBlocks, HARD_BLOCK_RULES } from '../../core/planner/hard-block-detector.js'
import { enumerateExternalBlocks } from '../../core/planner/external-blocker.js'
import { detectAvailableRuntimes, defaultRuntimeProbe } from '../../core/planner/available-runtimes.js'
import { sweepStaleLeases } from '../../core/planner/sweep-stale-leases.js'
import { resolveAgentId } from '../../core/planner/resolve-agent-id.js'
import { validateNextTaskInput } from '../../core/planner/validation.js'
import { randomUUID } from 'node:crypto'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import {
  detectValidateBacklogSignal,
  TOC_WAITING_MULTIPLIER,
  type TocValidateSignal,
} from '../../core/insights/bottleneck-detector.js'

const log = createLogger({ layer: 'cli', source: 'next-cmd.ts' })

// ── Anti-hijack (node_bfd8fa7d664d) ────────────────────────────────────────────
// metadata.claimedBy é o dono DURÁVEL de uma task em voo: a lease expira em
// minutos, o claimedBy só sai quando a task fecha. Task de outra formiga nunca
// é entregue — apenas sinalizada como FOREIGN_WIP no envelope. Leitor do dono
// é o claimedByOf compartilhado (core/planner/next-task.ts — fonte única).

interface OwnedNode {
  id: string
  metadata?: unknown
}

function foreignWipSummary(nodes: OwnedNode[]): Array<{ nodeId: string; agentId: string }> {
  return nodes.map((n) => ({ nodeId: n.id, agentId: claimedByOf(n) ?? 'unknown' }))
}

function foreignWipWarning(nodes: OwnedNode[]): string {
  const pairs = nodes.map((n) => `${n.id}@${claimedByOf(n) ?? 'unknown'}`).join(', ')
  return `FOREIGN_WIP: em voo de outra(s) formiga(s): ${pairs}`
}

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

          // node_b0600892ca5e — gatilho TOC (Item 9): sinal aditivo, não-bloqueante,
          // quando a fila de espera (blocked+awaiting) cruza o limiar × in_progress.
          // Lazy (só nos envelopes de pull bem-sucedido) para não tocar o caminho
          // NO_TASKS, que não lê stats. Limiar configurável via project setting.
          const computeTocSignal = (): TocValidateSignal | null => {
            const mult = Number(store.getProjectSetting('toc_waiting_multiplier') ?? '') || TOC_WAITING_MULTIPLIER
            return detectValidateBacklogSignal(store.getStats().byStatus, mult)
          }

          // Multi-agent mode: atomic lease-based claim so N agents never double-pull.
          // Bypasses the single-agent WIP advisory — each agent's WIP is its own lease.
          // node_wire_7d739490fe72 — resolveAgentId centralizes flag > AGF_AGENT_ID env
          // > generated-uuid. Only enters this branch when flag or env is set, so the
          // default (neither set) stays byte-identical to before: claim path skipped.
          if (opts.agent || process.env.AGF_AGENT_ID) {
            const agentId = resolveAgentId(opts.agent, process.env.AGF_AGENT_ID, () => randomUUID())
            // Boundary validation for the multi-agent claim input (mirrors kanban-cmd.ts's
            // validateKanbanInput wiring) — catches a malformed agentId before it reaches
            // the lease store instead of surfacing an opaque lock-manager failure.
            try {
              validateNextTaskInput({ agentId })
            } catch (err) {
              const message = err instanceof ZodError ? err.issues.map((i) => i.message).join('; ') : String(err)
              out.err('VALIDATION_ERROR', `Input inválido: ${message}`)
              return
            }
            // node_bfd8fa7d664d — anti-hijack: o dono durável de uma task em voo é
            // metadata.claimedBy (a lease expira em minutos; o claimedBy sobrevive).
            // Minha própria task in_progress ⇒ wip-idempotent (restart recovery);
            // task de OUTRA formiga ⇒ nunca retornada, só sinalizada (FOREIGN_WIP).
            const inProgressOwned = doc.nodes.filter((n) => n.status === 'in_progress')
            const mine = inProgressOwned.find((n) => claimedByOf(n) === agentId)
            if (mine && !opts.force) {
              const signals = getColonySignals(store.getStats())
              out.ok({
                node: mine,
                reason: 'wip-idempotent',
                warning: 'WIP_LIMIT: returning your existing in_progress task; use --force to pull a new one',
                suggested_model: signals.suggested_model,
                caste: signals.caste,
              })
              return
            }
            const foreign = inProgressOwned.filter((n) => {
              const owner = claimedByOf(n)
              return owner !== undefined && owner !== agentId
            })
            const ttlSeconds = opts.leaseTtl ? Number(opts.leaseTtl) : undefined
            const claimed = claimNextTask(doc, new LockManager(store.getDb()), agentId, {
              pierceContainers: opts.pierceContainers,
              ttlSeconds,
            })
            if (!claimed) {
              out.fail('NO_TASKS', 'Nenhuma task desbloqueada e não-reivindicada disponível.', {
                reason: 'all_claimed_or_blocked',
                ...(foreign.length > 0 ? { foreignWip: foreignWipSummary(foreign) } : {}),
              })
              return
            }
            // Persiste o dono no node — marcador que o wip-idempotent e o gate de
            // outras formigas leem mesmo depois de a lease expirar.
            store.updateNode(claimed.node.id, {
              metadata: { ...(claimed.node.metadata ?? {}), claimedBy: agentId },
            })
            const signals = getColonySignals(store.getStats())
            const data: Record<string, unknown> = {
              node: claimed.node,
              reason: claimed.reason,
              claim: claimed.claim,
              suggested_model: signals.suggested_model,
              caste: signals.caste,
            }
            if (claimed.warning) data.warning = claimed.warning
            const tocA = computeTocSignal()
            if (tocA) data.tocSignal = tocA
            if (foreign.length > 0) {
              data.foreignWip = foreignWipSummary(foreign)
              data.warning = [data.warning, foreignWipWarning(foreign)].filter(Boolean).join(' | ')
            }
            out.ok(data)
            return
          }

          const inProgress = doc.nodes.filter((n) => n.status === 'in_progress')
          // node_bfd8fa7d664d — anti-hijack no pull sem identidade: task in_progress
          // com dono registrado (claimedBy) pertence a outra formiga e NUNCA é
          // entregue como wip-idempotent; só a legada sem dono mantém o comportamento
          // de restart-recovery original.
          const unowned = inProgress.filter((n) => claimedByOf(n) === undefined)
          const foreignOwned = inProgress.filter((n) => claimedByOf(n) !== undefined)
          if (inProgress.length > 0) {
            if (opts.force) {
              // --force: bypass WIP guard, pull next backlog task, emit WIP_OVERRIDE warning
              log.warn('next:wip-override', { existingId: inProgress[0]!.id })
            } else if (unowned.length > 0) {
              // Idempotent pull: return the existing in_progress task rather than an error.
              // This lets an agent that restarts re-claim its own live task without manual cleanup.
              const signals = getColonySignals(store.getStats())
              out.ok({
                node: unowned[0]!,
                reason: 'wip-idempotent',
                warning: 'WIP_LIMIT: returning existing in_progress task; use --force to pull a new one',
                suggested_model: signals.suggested_model,
                caste: signals.caste,
              })
              return
            }
            // Todas as in_progress têm dono (outras formigas): segue para o pull
            // normal — o aviso FOREIGN_WIP vai anexado ao envelope de saída.
          }

          // Strict priority is the default: --aco forces on (roulette), --no-aco forces off
          // (same as the default, kept for clarity), neither flag → off. --seed makes the
          // roulette reproducible when --aco is used. All selection logic lives in
          // selectNextTaskSmart (DRY with start-cmd).
          const mode = resolveAcoMode({ aco: opts.aco === true, noAco: opts.aco === false })
          const rng = opts.seed !== undefined ? makeSeededPrng(Number(opts.seed)) : Math.random
          // node_77ee0139ce8d — teamTask também sem identidade: leases vivas de
          // qualquer agente e arquivos declarados das in_progress com dono são
          // exclusões do pull plain (defesa em profundidade além do anti-hijack).
          const lockedTaskIds = new Set(
            listActiveClaims(store.getDb())
              .filter((l) => l.resourceId.startsWith('task:'))
              .map((l) => l.resourceId.slice(5)),
          )
          const inFlightTouchedFiles = new Set<string>()
          for (const n of foreignOwned) for (const f of declaredFilesOf(n)) inFlightTouchedFiles.add(f)
          for (const id of lockedTaskIds) {
            const leased = doc.nodes.find((n) => n.id === id)
            if (leased) for (const f of declaredFilesOf(leased)) inFlightTouchedFiles.add(f)
          }
          const result = selectNextTaskSmart(doc, {
            getDb: () => store.getDb(),
            getProjectId: () => store.getProject()?.id ?? '',
            mode,
            rng,
            pierceContainers: opts.pierceContainers,
            alpha: () => readTunedAcoAlpha(store), // GA-tuned α when the autotune lever has learned one (T6c)
            ...(lockedTaskIds.size > 0 ? { lockedTaskIds } : {}),
            ...(inFlightTouchedFiles.size > 0 ? { inFlightTouchedFiles } : {}),
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
          const tocB = computeTocSignal()
          if (tocB) data.tocSignal = tocB
          // Gate de entrada (node_dd0aaabbed5c) como WARNING no next: o bloqueio
          // duro vive no agf start (AC contratual); aqui o sinal é aditivo para
          // não travar fluxos da colônia — mesmo detector, mesmo applyVia.
          const entryGate = checkEpicEntryGate(doc, result.node.id)
          if (entryGate.blocked) {
            data.gapsGate = { epicId: entryGate.epicId, gaps: entryGate.gaps.length, applyVia: entryGate.applyVia }
            data.warning = [
              data.warning,
              `GAPS_REQUIRED_OPEN: ${entryGate.gaps.length} gap(s) no épico ${entryGate.epicId}`,
            ]
              .filter(Boolean)
              .join(' | ')
          }
          if (opts.force && inProgress.length > 0)
            data.warning = `WIP_OVERRIDE: pulled new task while ${inProgress[0]!.id} is still in_progress`
          if (foreignOwned.length > 0) {
            data.foreignWip = foreignWipSummary(foreignOwned)
            data.warning = [data.warning, foreignWipWarning(foreignOwned)].filter(Boolean).join(' | ')
          }
          out.ok(data)
        } finally {
          store.close()
        }
      },
    )
}
