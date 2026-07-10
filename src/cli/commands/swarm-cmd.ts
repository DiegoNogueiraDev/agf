/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * `agf swarm` — drives the multi-agent fabric (LSTM §3 parameter-server analogue)
 * over the shared graph DB. Makes the swarm primitives invocable by any
 * CLI-agent: session lifecycle (coordinator), lease+TTL mutual exclusion
 * (claim-manager), async courier (mailbox), and vote consolidation (consensus).
 *
 * Opt-in surface — it does not touch the WIP=1 autopilot loop or the Flow engine.
 * Thin orchestration over src/core/swarm.
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { getErrorMessage } from '../../core/utils/errors.js'
import { sweepStaleLeases } from '../../core/planner/sweep-stale-leases.js'
import { getAgentActivity } from '../../core/insights/agent-activity.js'
import {
  SwarmCoordinator,
  AgentClaimManager,
  AgentClaimConflictError,
  A2AMailbox,
  computeMajorityConsensus,
  type Vote,
} from '../../core/swarm/index.js'
import { isSwarmAutoPromoteDisabled } from '../../core/hooks/swarm-consensus-promoter.js'
import { verifyAndPromote } from '../../core/utils/verified-auto-promote.js'
import { delegateSubtasksParallel } from '../../core/autonomy/delegate-parallel.js'
import { createBudgetGuard } from '../../core/autonomy/budget-guard.js'
import { createSharedFindings } from '../../core/autonomy/shared-findings.js'
import { buildExecutorBrief, type ExecutorBrief } from '../../core/context/executor-brief.js'
import { estimateBriefTokens } from '../../core/context/brief-ceiling.js'

const log = createLogger({ layer: 'cli', source: 'swarm-cmd.ts' })

type DirOpt = { dir: string }
const dirOpt = (c: Command): Command => c.option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())

/** Builds the `agf swarm` CLI command (Commander definition). */
export function swarmCommand(): Command {
  log.info('swarm command registered')
  const cmd = new Command('swarm').description(
    'Coordenação multi-agente sobre o grafo (sessão/claim/mailbox/consensus) — opt-in, não toca no loop',
  )

  // ── Session lifecycle (SwarmCoordinator) ──────────────────────────────────
  dirOpt(
    cmd
      .command('init')
      .description('Cria uma sessão de swarm (pending)')
      .requiredOption('--topology <t>', 'hierarchical|mesh|ring|star')
      .requiredOption('--consensus <c>', 'raft|majority')
      .option('--max <n>', 'maxAgents (1..32)', '4')
      .option('--strategy <s>', 'strategy', 'specialized'),
  ).action((opts: DirOpt & { topology: string; consensus: string; max: string; strategy: string }) => {
    const out = createCliOutput('swarm.init')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const session = new SwarmCoordinator(store.getDb()).init({
        topology: opts.topology as never,
        consensus: opts.consensus as never,
        maxAgents: Number(opts.max),
        strategy: opts.strategy,
      })
      out.ok(session)
    } catch (e) {
      out.err('INVALID_CONFIG', getErrorMessage(e))
    } finally {
      store.close()
    }
  })

  for (const [name, verb] of [
    ['start', 'Ativa'],
    ['stop', 'Para'],
    ['status', 'Lê'],
  ] as const) {
    dirOpt(cmd.command(name).description(`${verb} uma sessão de swarm`).argument('<id>', 'session id')).action(
      (id: string, opts: DirOpt) => {
        const out = createCliOutput(`swarm.${name}`)
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const coord = new SwarmCoordinator(store.getDb())
          const session = name === 'start' ? coord.start(id) : name === 'stop' ? coord.stop(id) : coord.status(id)
          out.ok(session)
        } catch (e) {
          out.err('NOT_FOUND', getErrorMessage(e))
        } finally {
          store.close()
        }
      },
    )
  }

  dirOpt(
    cmd
      .command('scale')
      .description('Ajusta o teto de agentes (1..32)')
      .argument('<id>', 'session id')
      .argument('<max>', 'novo máximo'),
  ).action((id: string, max: string, opts: DirOpt) => {
    const out = createCliOutput('swarm.scale')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      out.ok(new SwarmCoordinator(store.getDb()).scale(id, Number(max)))
    } catch (e) {
      out.err('INVALID_SCALE', getErrorMessage(e))
    } finally {
      store.close()
    }
  })

  // ── Claim / lease (AgentClaimManager) ─────────────────────────────────────
  dirOpt(
    cmd
      .command('claim')
      .description('Reivindica um recurso (lease+TTL) — exclusão mútua entre agentes')
      .argument('<resource>', 'resource id (ex: node id)')
      .requiredOption('--agent <id>', 'agent id')
      .option('--ttl <seconds>', 'lease TTL em segundos', '300'),
  ).action((resource: string, opts: DirOpt & { agent: string; ttl: string }) => {
    const out = createCliOutput('swarm.claim')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const claim = new AgentClaimManager(store.getDb()).claim(resource, opts.agent, Number(opts.ttl))
      out.ok(claim)
    } catch (e) {
      if (e instanceof AgentClaimConflictError) {
        out.fail('CLAIM_CONFLICT', getErrorMessage(e), { retryable: true })
        return
      }
      out.err('CLAIM_ERROR', getErrorMessage(e))
    } finally {
      store.close()
    }
  })

  dirOpt(
    cmd.command('release').description('Libera um lease (idempotente)').argument('<leaseToken>', 'lease token'),
  ).action((leaseToken: string, opts: DirOpt) => {
    const out = createCliOutput('swarm.release')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      new AgentClaimManager(store.getDb()).release(leaseToken)
      out.ok({ released: leaseToken })
    } finally {
      store.close()
    }
  })

  // ── Sweep stale claims ───────────────────────────────────────────────────
  dirOpt(cmd.command('sweep').description('Sweep expired claim leases so tasks become pullable again')).action(
    (opts: DirOpt) => {
      const out = createCliOutput('swarm.sweep')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const swept = sweepStaleLeases(store.getDb())
        out.ok({ swept })
      } finally {
        store.close()
      }
    },
  )

  // ── Mailbox (A2AMailbox) ──────────────────────────────────────────────────
  dirOpt(
    cmd
      .command('send')
      .description('Envia mensagem agente-a-agente (courier)')
      .requiredOption('--from <id>', 'remetente')
      .requiredOption('--to <id>', 'destinatário')
      .requiredOption('--body <json>', 'corpo (JSON)'),
  ).action((opts: DirOpt & { from: string; to: string; body: string }) => {
    const out = createCliOutput('swarm.send')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      let body: unknown
      try {
        body = JSON.parse(opts.body)
      } catch {
        body = opts.body
      }
      out.ok(new A2AMailbox(store.getDb()).send({ from: opts.from, to: opts.to, body }))
    } finally {
      store.close()
    }
  })

  dirOpt(
    cmd
      .command('recv')
      .description('Recebe a mensagem pendente mais antiga (→delivered)')
      .argument('<agent>', 'destinatário'),
  ).action((agent: string, opts: DirOpt) => {
    const out = createCliOutput('swarm.recv')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const msg = new A2AMailbox(store.getDb()).recv(agent)
      if (msg === null) {
        out.ok({ message: null })
        return
      }
      out.ok({ message: msg })
    } finally {
      store.close()
    }
  })

  dirOpt(cmd.command('ack').description('Confirma uma mensagem (→acked)').argument('<id>', 'message id')).action(
    (id: string, opts: DirOpt) => {
      const out = createCliOutput('swarm.ack')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const msg = new A2AMailbox(store.getDb()).ack(id)
        if (msg === null) {
          out.err('NOT_FOUND', `message not found: ${id}`)
          return
        }
        out.ok({ message: msg })
      } finally {
        store.close()
      }
    },
  )

  // ── Consensus (majority) ──────────────────────────────────────────────────
  dirOpt(cmd.command('consensus').description('Consolida votos por maioria simples (floor(N/2)+1)'))
    .requiredOption('--votes <json>', 'JSON array de {agentId,value}')
    .option('--node-id <id>', 'Node cujos ancestrais promover via verifyAndPromote quando consenso for atingido')
    .option('--auto-promote', 'Quando --node-id é dado e consenso é atingido, chama verifyAndPromote de verdade', false)
    .action(async (opts: { votes: string; dir: string; nodeId?: string; autoPromote?: boolean }) => {
      const out = createCliOutput('swarm.consensus')
      let votes: Vote<unknown>[]
      try {
        votes = JSON.parse(opts.votes) as Vote<unknown>[]
      } catch (e) {
        out.err('PARSE_ERROR', getErrorMessage(e))
        return
      }
      try {
        const consensus = computeMajorityConsensus(votes)
        // node_wire_572b860d8df7 — swarm-consensus-promoter's differentiating
        // piece (the two consensus modules intentionally coexist, per
        // majority.ts's own docblock: it's the vote-level primitive,
        // swarm-consensus-promoter operates on the resulting tally). Only
        // fires when the caller explicitly opts in via --node-id + --auto-promote.
        let promotion: Awaited<ReturnType<typeof verifyAndPromote>> | undefined
        if (consensus.reached && opts.nodeId && opts.autoPromote && !isSwarmAutoPromoteDisabled()) {
          const store = openStoreOrFail(opts.dir, { requireExisting: true })
          try {
            promotion = await verifyAndPromote(store, opts.nodeId)
          } finally {
            store.close()
          }
        }
        out.ok({ ...consensus, promotion })
      } catch (e) {
        out.err('CONSENSUS_ERROR', getErrorMessage(e))
      }
    })

  // ── Agent activity (heartbeat + lock derived, node_wire_c8134b52d315) ────
  dirOpt(cmd.command('agents').description('Lê status ao vivo dos agentes (heartbeat + locks + task atual)')).action(
    (opts: DirOpt) => {
      const out = createCliOutput('swarm.agents')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        out.ok({ agents: getAgentActivity(store.getDb()) })
      } finally {
        store.close()
      }
    },
  )

  // ── Fan-out (delegateSubtasksParallel + BudgetGuard, B5) ──────────────────
  dirOpt(
    cmd
      .command('fan-out')
      .description('Builds delegated briefs for N nodes concurrently, optionally bounded by a token ceiling')
      .requiredOption('--nodes <ids>', 'Comma-separated node ids')
      .option('--max-tokens <n>', 'Token ceiling for the batch — stops building further briefs once reached')
      .option(
        '--dedupe',
        'Flag briefs whose intent duplicates a sibling already built in this fan-out (see report.deduped)',
        false,
      ),
  ).action(async (opts: DirOpt & { nodes: string; maxTokens?: string; dedupe?: boolean }) => {
    const out = createCliOutput('swarm.fan-out')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const ids = opts.nodes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const subtasks = ids.map((id) => ({ id, title: id }))
      const budget = opts.maxTokens ? createBudgetGuard(Number(opts.maxTokens)) : undefined
      const findings = opts.dedupe ? createSharedFindings() : undefined
      const briefs = new Map<string, ExecutorBrief>()

      const report = await delegateSubtasksParallel(
        subtasks,
        {
          runSubagent: async (subtask) => {
            const brief = buildExecutorBrief(store, subtask.id)
            if (!brief) {
              return { success: false, tokensUsed: 0, summary: `node not found: ${subtask.id}` }
            }
            briefs.set(subtask.id, brief)
            return { success: true, tokensUsed: estimateBriefTokens(brief), summary: brief.intent }
          },
        },
        { budget, findings },
      )

      out.ok({ report, briefs: Object.fromEntries(briefs) })
    } finally {
      store.close()
    }
  })

  return cmd
}
