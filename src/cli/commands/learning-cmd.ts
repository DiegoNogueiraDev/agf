/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { SqliteLearningStore } from '../../core/learning/sqlite-learning-store.js'
import { depositToolPheromone, topToolsForIntent, selectTool } from '../../core/economy/tool-pheromone.js'
import {
  actionStats,
  actionRoute,
  actionExplain,
  actionExport,
  actionCompile,
} from '../../core/learning/learning-actions.js'
import { DecisionTableStore } from '../../core/learning/decision-table-store.js'
import { resolveDecision, recordFastPathSaving } from '../../core/learning/decision-fast-path.js'
import { distillStar, type ReasoningTrace } from '../../core/learning/star-distillation.js'
import { compileDecisions } from '../../core/learning/learning-compiler.js'
import type { DecisionContext } from '../../core/learning/decision-key.js'
import type { RoutingStrategy } from '../../core/learning/routing-strategy.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { summarizeLedgerByTier } from '../../core/observability/llm-call-ledger.js'
import { aggregateCasteBreakdown } from '../../core/learning/caste-breakdown.js'
import { SqliteTrajectoryStore } from '../../core/learning/sqlite-trajectory-store.js'
import { storeTrajectory, recallSimilar, recallSuccessful } from '../../core/learning/reasoning-bank.js'
import { generateId } from '../../core/utils/id.js'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'learning-cmd.ts' })

function withStore<T>(dir: string, fn: (store: SqliteStore) => T): T {
  const store = openStoreOrFail(dir, { requireExisting: true })
  try {
    return fn(store)
  } finally {
    store.close()
  }
}

/** Store de decisões compiladas escopado ao projeto aberto (mesmo projectId dos perf_records). */
function decisionStoreFor(store: SqliteStore): DecisionTableStore {
  return new DecisionTableStore(store.getDb(), store.getProject()?.id ?? 'default')
}

/** Builds the `agf learning` CLI command (Commander definition). */
export function learningCommand(): Command {
  log.info('learning command registered')
  const cmd = new Command('learning').description('Aprendizado persistido: performance por agente, roteamento, export')

  cmd
    .command('stats', { isDefault: true })
    .description('Estatísticas de performance por agente (persistidas)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('learning-stats')
      const { result, compiledCount, tiers, casteBreakdown } = withStore(opts.dir, (store) => ({
        result: actionStats(new SqliteLearningStore(store)),
        compiledCount: decisionStoreFor(store).count(),
        tiers: summarizeLedgerByTier(store.getDb()),
        casteBreakdown: aggregateCasteBreakdown(store.getDb(), store.getProject()?.id ?? 'default'),
      }))
      const totalTierCalls = tiers.reduce((s, t) => s + t.calls, 0)
      const cheapPct =
        totalTierCalls > 0
          ? Math.round(((tiers.find((t) => t.tier === 'cheap')?.calls ?? 0) / totalTierCalls) * 100)
          : null

      // Aggregate, select-friendly metrics (0–1 rates) derived from the per-agent
      // records — task-count-weighted so a noisy low-volume agent can't skew them.
      const totalTasks = result.agents.reduce((s, a) => s + a.taskCount, 0)
      const accuracy =
        totalTasks > 0
          ? +(result.agents.reduce((s, a) => s + a.acPassRate * a.taskCount, 0) / totalTasks).toFixed(3)
          : 0
      const errorRate = +(1 - accuracy).toFixed(3)
      const escalations = tiers.reduce((s, t) => s + t.escalatedCalls, 0)
      const routing = { cheapPct, totalCalls: totalTierCalls, escalations }
      // Worst-performing routes (lowest AC pass rate first) — where to intervene.
      const worstRoutes = [...result.agents]
        .filter((a) => a.taskCount > 0)
        .sort((a, b) => a.acPassRate - b.acPassRate)
        .slice(0, 3)
        .map((a) => ({ agentId: a.agentId, acPassRate: a.acPassRate, taskCount: a.taskCount }))

      out.ok({
        totalRecords: result.totalRecords,
        compiledCount,
        accuracy,
        errorRate,
        routing,
        worstRoutes,
        agents: result.agents.map((a) => ({
          agentId: a.agentId,
          taskCount: a.taskCount,
          acPassRate: a.acPassRate,
          meanHarnessDelta: a.meanHarnessDelta,
          meanCycleTimeMs: a.meanCycleTimeMs,
        })),
        tiers: tiers.map((t) => ({
          tier: t.tier,
          calls: t.calls,
          callsPct: t.callsPct,
          avgTokensTotal: t.avgTokensTotal,
          avgCostUsd: t.avgCostUsd,
          escalatedCalls: t.escalatedCalls,
        })),
        cheapPct,
        casteBreakdown,
      })
    })

  cmd
    .command('compile')
    .description('Compila decisões repetidas e bem-sucedidas em regras determinísticas (fast-path zero-token)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('learning-compile')
      const res = withStore(opts.dir, (store) => actionCompile(new SqliteLearningStore(store), decisionStoreFor(store)))
      out.ok({ compiled: res.compiled, skipped: res.skipped, emittedKeys: res.emittedKeys })
    })

  cmd
    .command('lookup')
    .description('Consulta o fast-path zero-token (replay de decisão compilada, sem chamar LLM)')
    .argument('<domain>', 'Domínio da decisão (ex.: área do código, módulo)')
    .argument('<phase>', 'Fase do ciclo (ex.: SHAPE | BUILD | SHIP)')
    .argument('<role>', 'Papel/tipo da tarefa ou agente')
    .argument('<input>', 'Entrada que determina a decisão (normalizada)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--tokens-saved <n>', 'Tokens que a chamada LLM evitada teria custado', (v) => Number.parseInt(v, 10), 0)
    .option('--session <id>', 'ID de sessão para atribuição no llm_call_ledger', 'cli')
    .option('--node <id>', 'ID do node do grafo a atribuir a economia (opcional)')
    .action(
      (
        domain: string,
        phase: string,
        role: string,
        input: string,
        opts: { dir: string; tokensSaved: number; session: string; node?: string },
      ) => {
        const out = createCliOutput('learning-lookup')
        const result = withStore(opts.dir, (store) => {
          const db = store.getDb()
          const context: DecisionContext = { domain, phase, role, input }
          return resolveDecision(context, decisionStoreFor(store), () => null, {
            estimatedTokensSaved: opts.tokensSaved,
            onHit: (hit) =>
              recordFastPathSaving(db, {
                sessionId: opts.session,
                key: hit.key,
                tokensSaved: hit.estimatedTokensSaved,
                projectId: store.getProject()?.id,
                nodeId: opts.node,
              }),
          })
        })
        out.ok({ fromFastPath: result.fromFastPath, key: result.key, decision: result.decision })
      },
    )

  cmd
    .command('distill')
    .description('Distila traces de raciocínio (STaR, Opus→Haiku) em decisões compiladas no fast-path zero-token')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--traces <json>', 'Array JSON de ReasoningTrace a distilar')
    .action((opts: { dir: string; traces?: string }) => {
      const out = createCliOutput('learning-distill')
      if (!opts.traces) {
        out.err('MISSING_TRACES', 'Forneça --traces <json> com o array de ReasoningTrace')
        return
      }
      let traces: ReasoningTrace[]
      try {
        traces = JSON.parse(opts.traces) as ReasoningTrace[]
      } catch {
        out.err('INVALID_JSON', '--traces não é um JSON válido')
        return
      }
      const observations = distillStar(traces)
      const result = withStore(opts.dir, (store) => compileDecisions(observations, decisionStoreFor(store)))
      out.ok({
        observations: observations.length,
        compiled: result.compiled,
        skipped: result.skipped,
        emittedKeys: result.emittedKeys,
      })
    })

  cmd
    .command('route')
    .description('Decisão de roteamento de agente baseada no histórico')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('-s, --strategy <strategy>', 'Estratégia de roteamento (ex: knn, greedy)')
    .action((opts: { dir: string; strategy?: string }) => {
      const out = createCliOutput('learning-route')
      const decision = withStore(opts.dir, (store) =>
        actionRoute(new SqliteLearningStore(store), opts.strategy as RoutingStrategy | undefined),
      )
      out.ok({ agentId: decision.agentId, strategy: decision.strategy, reason: decision.reason })
    })

  cmd
    .command('explain')
    .description('Explica a decisão de roteamento (breakdown)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('-s, --strategy <strategy>', 'Estratégia de roteamento')
    .action((opts: { dir: string; strategy?: string }) => {
      const out = createCliOutput('learning-explain')
      const exp = withStore(opts.dir, (store) =>
        actionExplain(new SqliteLearningStore(store), opts.strategy as RoutingStrategy | undefined),
      )
      out.ok(exp)
    })

  cmd
    .command('tools')
    .description('Roteamento ACO de ferramentas por intent (pheromone trails intent→tool)')
    .argument('<intent>', 'Intent a consultar (ex: "search-code", "edit-file")')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--deposit <tool>', 'Reforça a trilha (intent, tool) antes de consultar')
    .option('--amount <n>', 'Quantidade depositada com --deposit', (v) => Number.parseFloat(v), 1.0)
    .option('--limit <n>', 'Top-N ferramentas retornadas', (v) => Number.parseInt(v, 10), 3)
    .action((intent: string, opts: { dir: string; deposit?: string; amount: number; limit: number }) => {
      const out = createCliOutput('learning-tools')
      const { top, selected } = withStore(opts.dir, (store) => {
        const db = store.getDb()
        if (opts.deposit) {
          depositToolPheromone(db, { intent, tool: opts.deposit, amount: opts.amount })
        }
        const top = topToolsForIntent(db, intent, opts.limit)
        return { top, selected: selectTool(top) }
      })
      out.ok({ intent, top, selected })
    })

  cmd
    .command('trajectory-record')
    .description('Registra uma trajetória de execução (tool_sequence) para recall futuro (ReasoningBank)')
    .argument('<nodeId>', 'ID do node associado (deve existir no grafo)')
    .argument('<toolSequence>', 'Sequência de ferramentas usada, separada por vírgula (ex: Read,Edit,Bash)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--outcome <score>', 'Score de resultado [0..1]', (v) => Number.parseFloat(v), 1)
    .option('--notes <text>', 'Notas opcionais sobre a trajetória')
    .option('--agent <name>', 'Nome do agente que executou', 'agf-cli')
    .action(
      (
        nodeId: string,
        toolSequenceArg: string,
        opts: { dir: string; outcome: number; notes?: string; agent: string },
      ) => {
        const out = createCliOutput('learning-trajectory-record')
        const toolSequence = toolSequenceArg
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        const trajectory = withStore(opts.dir, (store) => {
          const trajStore = new SqliteTrajectoryStore(store, opts.agent)
          return storeTrajectory(trajStore, {
            id: generateId('traj'),
            nodeId,
            toolSequence,
            outcomeScore: opts.outcome,
            notes: opts.notes,
            ts: Date.now(),
          })
        })
        out.ok({
          id: trajectory.id,
          nodeId: trajectory.nodeId,
          toolSequence: trajectory.toolSequence,
          outcomeScore: trajectory.outcomeScore,
        })
      },
    )

  cmd
    .command('trajectory-recall')
    .description('Recorda trajetórias similares por sequência de ferramentas (ReasoningBank)')
    .argument('<toolSequence>', 'Sequência de ferramentas a comparar, separada por vírgula')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--top-k <n>', 'Quantidade de resultados', (v) => Number.parseInt(v, 10), 5)
    .option('--min-score <n>', 'Score mínimo de outcome — filtra apenas trajetórias bem-sucedidas', (v) =>
      Number.parseFloat(v),
    )
    .action((toolSequenceArg: string, opts: { dir: string; topK: number; minScore?: number }) => {
      const out = createCliOutput('learning-trajectory-recall')
      const toolSequence = toolSequenceArg
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const matches = withStore(opts.dir, (store) => {
        const trajStore = new SqliteTrajectoryStore(store)
        return opts.minScore !== undefined
          ? recallSuccessful(trajStore, toolSequence, opts.minScore, opts.topK)
          : recallSimilar(trajStore, toolSequence, opts.topK)
      })
      out.ok({
        matches: matches.map((m) => ({
          id: m.trajectory.id,
          nodeId: m.trajectory.nodeId,
          toolSequence: m.trajectory.toolSequence,
          similarity: m.similarity,
          outcomeScore: m.trajectory.outcomeScore,
        })),
      })
    })

  cmd
    .command('export')
    .description('Exporta todos os registros de learning (JSON)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('learning-export')
      const payload = withStore(opts.dir, (store) => actionExport(new SqliteLearningStore(store)))
      out.ok(payload)
    })

  return cmd
}
