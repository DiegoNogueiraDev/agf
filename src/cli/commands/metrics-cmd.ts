/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { computeFirstPassYield } from '../../core/economy/first-pass-yield.js'
import { loadRdBaseline } from '../../core/economy/rd-sweep.js'
import { describeDelegateEconomy } from '../../core/economy/delegate-baseline.js'
import { openStoreOrFail } from '../open-store.js'
import { surfaceGateReport } from '../../core/observability/scenario-verdict-store.js'
import { isSurfaceTask } from '../../core/implementer/surface-task.js'
import { summarizeLedger, summarizeConductorCost } from '../../core/observability/llm-call-ledger.js'
import { summarizeBaseline, simulateProviders } from '../../core/observability/baseline.js'
import { formatEconomyReport, summarizeByLever } from '../../core/economy/economy-lever-ledger.js'
import { successfulNodeIds } from '../../core/store/episodic-outcomes-store.js'
import { getCumulativeSavings } from '../../core/economy/savings-tracker.js'
import { resolveEconomyLeversConfig, isLeverEnabled } from '../../core/economy/economy-levers-config.js'
import { computeCognitiveDebt } from '../../core/economy/cognitive-debt.js'
import { collectVelocityScorecard } from '../../core/evals/scorecard.js'
import { createLogger } from '../../core/utils/logger.js'
import { buildCascadeAbDelta } from '../../core/economy/cascade-ab-delta.js'
import { createCliOutput } from '../shared/cli-output.js'
import { genesisMetricsSection } from '../../core/orchestrator/genesis-metrics.js'
import { buildContextScorecard } from '../../core/observability/context-scorecard.js'

const log = createLogger({ layer: 'cli', source: 'metrics-cmd.ts' })

/** Builds the `agf metrics` CLI command (Commander definition). */
export function metricsCommand(): Command {
  log.info('metrics command registered')
  return new Command('metrics')
    .description('Métricas de token do loop autônomo (tokens/task, tokens/sessão) a partir do llm_call_ledger')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('-s, --session <id>', 'Restringe às chamadas de uma sessão')
    .option('--top <n>', 'Limita o top N de tasks exibidas', '10')
    .option('--economy-report', 'Mostra economia por lever (economy_lever_ledger)')
    .option('--baseline', 'Decompõe a fatura nos 3 termos (§1) + baseline contrafactual + veredito §6')
    .option('--simulate', 'Re-precifica a fatura real sob todos os modelos (pior caso → margem de melhoria)')
    .action(
      (opts: {
        dir: string
        session?: string
        top: string
        economyReport?: boolean
        baseline?: boolean
        simulate?: boolean
      }) => {
        const out = createCliOutput('metrics')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          if (opts.baseline) {
            out.ok(summarizeBaseline(store.getDb(), { sessionId: opts.session }))
            return
          }
          if (opts.simulate) {
            const t = summarizeLedger(store.getDb(), { sessionId: opts.session }).totals
            out.ok(simulateProviders(t.tokensIn, t.cachedTokensIn, t.tokensOut))
            return
          }
          if (opts.economyReport) {
            const savings = getCumulativeSavings(store, opts.dir)
            // The old line read "CLI economy: 7458030432 tok economizados (99%)" — a saving nobody
            // could dispute because nobody could reproduce its baseline. See delegate-baseline.ts.
            const note = savings.delegateEconomy ? describeDelegateEconomy(savings.delegateEconomy) : undefined
            out.ok({
              report: formatEconomyReport(store.getDb()),
              delegateEconomy: savings.delegateEconomy,
              note,
              // Curva rate-distortion persistida (E4): null ate o primeiro
              // economy:gate semear a baseline.
              rd: loadRdBaseline(store),
              // Delta antes→depois do A/B do cascade (node_616e64c1a5ad): o número
              // do experimento aparece no comando que o usuário roda, não só no banco.
              // hasData=false ⇒ "sem dados" explícito, nunca um zero que parece economia.
              cascadeAb: buildCascadeAbDelta(store.getDb()),
              // Flat, select-friendly headline fields (agents: --select data.totalCostUsd,data.savings).
              totalCostUsd: +(savings.totals?.cost ?? 0).toFixed(4),
              savings: savings.totalSaved ?? 0,
            })
            return
          }

          const summary = summarizeLedger(store.getDb(), { sessionId: opts.session })
          const levers = summarizeByLever(store.getDb(), opts.session)
          const tokensSaved = levers.reduce((a, l) => a + l.totalSaved, 0)
          const successNodes = successfulNodeIds(store.getDb())
          const succeeded = summary.byTask.filter((t) => successNodes.has(t.nodeId)).length
          const costPerSuccess = succeeded > 0 ? summary.totals.costUsd / succeeded : null

          const savings = getCumulativeSavings(store, opts.dir)
          const delegateNote =
            summary.totals.total === 0 && (savings.delegateEconomy?.cmdCalls ?? 0) > 0
              ? 'llm_tok=0 é correto em modo delegate. Use agf savings para CLI economy.'
              : undefined

          const context = buildContextScorecard(store.getDb())

          // Cognitive-debt indicator (anti-vibe-coding): opt-in via
          // `agf economy on cognitive_debt`. Default OFF ⇒ byte-identical output.
          const leversCfg = resolveEconomyLeversConfig(store)
          const cognitiveDebt = isLeverEnabled(leversCfg, 'cognitive_debt')
            ? computeCognitiveDebt({
                taskTokens: summary.byTask.map((t) => ({ nodeId: t.nodeId, total: t.total })),
                totalTasks: store
                  .getAllNodes()
                  .filter((n) => (n.type === 'task' || n.type === 'subtask') && n.status === 'done').length,
              })
            : undefined

          // Consumer-side cost: the driving agent's self-reported tokens (provider='delegated'),
          // kept SEPARATE from agf's own `totals` (which stay 0 in delegate mode). This is the
          // dominant cost agf could not see until `agf submit --tokens` / the OTEL ingest fed it.
          const consumerCost = summarizeConductorCost(store.getDb())

          // FPY (F3.T1): assertividade da janela — first-pass / delivered sobre os
          // episodic outcomes. Superfície de leitura da métrica de retrabalho.
          const fpy = computeFirstPassYield(store.getDb(), { maxAgeDays: 30 })

          // node_64d196c10406 — time-to-first-brief: seção genesis (null quando
          // o projeto nunca rodou genesis ⇒ saída byte-idêntica à atual).
          const genesis = genesisMetricsSection(store.getDb())

          // Velocity dims (node_d35e86e659dc): fonte única em scorecard.ts —
          // a MESMA computação exibida por agf eval e agf insights.
          const velocity = collectVelocityScorecard(store)

          // Surface-gate KR instrument (node_af8a42bfa371): counts derived by running
          // the real gate decision over the real verdict rows — a hardcoded zero here
          // would read identically with the gate unwired.
          const doc = store.toGraphDocument()
          const surfaceIds = doc.nodes.filter((n) => isSurfaceTask(doc, n.id)).map((n) => n.id)
          const surfaceGate = surfaceGateReport(store.getDb(), surfaceIds)

          out.ok({
            ...(genesis ? { genesis } : {}),
            surfaceGate,
            totals: summary.totals,
            consumerCost,
            fpy,
            velocity,
            avgTokensPerTask: summary.avgTokensPerTask,
            taskCount: summary.byTask.length,
            sessionCount: summary.bySession.length,
            byTask: summary.byTask.slice(0, parseInt(opts.top, 10) || 10),
            bySession: opts.session ? [] : summary.bySession,
            costPerSuccess,
            succeeded,
            tokensSaved,
            levers,
            context,
            ...(cognitiveDebt ? { cognitiveDebt } : {}),
            ...(delegateNote ? { delegateNote } : {}),
            ...(savings.delegateEconomy ? { delegateEconomy: savings.delegateEconomy } : {}),
          })
        } finally {
          store.close()
        }
      },
    )
}
