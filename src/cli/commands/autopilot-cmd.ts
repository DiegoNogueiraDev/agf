/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { runImmuneCycle } from '../../core/immune/index.js'
import { runAutopilot } from '../../core/autonomy/autopilot-loop.js'
import { buildGapsGate } from '../../core/autonomy/gaps-gate.js'
import { buildHealDiagnose } from '../../core/autonomy/heal-gate.js'
import { flushHooks } from '../../core/hooks/hook-runtime.js'
import { TokenLedger } from '../../core/autonomy/token-ledger.js'
import { persistLedger } from '../../core/observability/llm-call-ledger.js'
import { maybeRunMemoryDynamicsTick } from '../../core/rag/memory-dynamics-tick.js'
import { buildLiveImplement } from '../shared/live-implement.js'
import { detectAgfLlm, buildDelegatedEnvelope } from '../shared/delegation.js'
import { findNextTask } from '../../core/planner/next-task.js'
import { makeStorePort } from '../shared/store-port.js'
import { resolveHarvestHook } from '../shared/build-harvest-hook.js'
import { enableFlowConfig } from '../shared/enable-flow.js'
import { applyProfile } from './profile-cmd.js'
import { randomUUID } from 'node:crypto'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { emitCircuitBreakHook } from '../../core/hooks/finalization-lifecycle-hooks.js'
import { getColonySignals } from '../../core/colony/colony-signals.js'

const log = createLogger({ layer: 'cli', source: 'autopilot-cmd.ts' })

function progress(msg: string): void {
  process.stderr.write(msg + '\n')
}

/** Builds the `agf autopilot` CLI command (Commander definition). */
export function autopilotCommand(): Command {
  log.info('autopilot command registered')
  return new Command('autopilot')
    .description('Loop autônomo com guardrails: next → in_progress → DoD → done|escalate (WIP=1)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('-m, --max <n>', 'Budget: máximo de tasks por sessão (cost-runaway guard)', '5')
    .option('--simulate', 'Simula impl bem-sucedida (deixa o DoD real decidir) — não escreve código', false)
    .option(
      '--delegate',
      'Modo delegado: aguarda pilot externo (Claude/Copilot/Codex) executar e fechar com agf submit',
      false,
    )
    .option('--live', 'Invoca o modelo real via SDK do Copilot: gera plano → aplica → roda testes → done|escala', false)
    .option('--test-cmd <cmd>', 'Comando de teste rodado no modo --live quando o plano não traz um', 'npm test')
    .option('--retries <n>', 'Tentativas por task no --live (retry com feedback compacto do teste)', '2')
    .option('--flow', 'Ativa a diluição de contexto por λ_flow (hipofrontalidade) no --live', false)
    .option('--gate-gaps', 'Pre-gate determinístico (~0 token): escala a task se tiver gap required ancorado', false)
    .option('--heal-on-fail', 'Na falha, roda diagnóstico MAPE-K (dry-run, sem mutar) e anexa à escalada', false)
    .option(
      '--no-harvest',
      'Desliga a colheita automática no NO_TASKS (default: colhe — migrate-ac + risk-surface + wire-dormant — e re-alimenta o loop em vez de parar)',
    )
    .option('--profile <nome>', 'Aplica um bundle de trabalho (fast|build|frontier): tier+flow+retries')
    .action(
      async (opts: {
        dir: string
        max: string
        simulate: boolean
        live: boolean
        testCmd: string
        retries: string
        flow: boolean
        gateGaps: boolean
        healOnFail: boolean
        harvest: boolean // Commander: true by default, false when --no-harvest is passed
        profile?: string
      }) => {
        const out = createCliOutput('autopilot')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const maxIterations = Math.max(1, parseInt(opts.max, 10) || 5)
          const port = makeStorePort(store)

          let retriesOverride: number | undefined
          if (opts.profile) {
            const applied = applyProfile(store, opts.profile)
            if (!applied) {
              out.err('INVALID_INPUT', `Profile desconhecido: ${opts.profile}. Tente 'profile list'.`)
              store.close()
              return
            }
            retriesOverride = applied.retries
            progress(
              `[PROFILE] ${opts.profile}: tier=${applied.modelTier} flow=${applied.flow} retries=${applied.retries}\n`,
            )
          }

          if (opts.flow) {
            enableFlowConfig(store)
            progress('[FLOW] λ_flow ativo: contexto do grafo diluído por Φ(t) (esquecimento dinâmico).\n')
          }
          if (opts.simulate) progress('[SIMULAÇÃO] impl tratada como verde — DoD real decide prontidão.\n')

          // Modo delegado: --live sem provider próprio não quebra — devolve o brief
          // da próxima task p/ a CLI-agente executar e fechar via `agf submit`.
          if (opts.live) {
            const detected = detectAgfLlm(store)
            if (!detected.available) {
              const next = findNextTask(store.toGraphDocument())
              out.ok(await buildDelegatedEnvelope({ detected, store, taskId: next?.node.id, projectDir: opts.dir }))
              return
            }
            progress('[LIVE] modelo via SDK do Copilot: gera plano → aplica no workspace → roda testes.\n')
          }

          let implement: (node: { id: string; title: string }) => boolean | Promise<boolean>
          let ledger: TokenLedger | undefined
          if (opts.live) {
            ledger = new TokenLedger()
            const live = buildLiveImplement({
              store,
              dir: opts.dir,
              testCmd: opts.testCmd,
              retries: retriesOverride ?? (parseInt(opts.retries, 10) || 2),
              ledger,
              onLog: progress,
            })
            if (live.repoSymbolCount > 0) progress(`[LIVE] repo-map: ${live.repoSymbolCount} símbolo(s) indexado(s).`)
            implement = live.implement
          } else if (opts.simulate) {
            implement = () => true
          } else {
            implement = () => false
          }

          const beforeImplement = opts.gateGaps ? buildGapsGate(store) : undefined
          const onFailure = opts.healOnFail ? buildHealDiagnose(store) : undefined
          const onHarvest = resolveHarvestHook(store, opts.dir, { noHarvest: !opts.harvest })
          // §E5.3 — same colony-signals computation next-cmd.ts already uses for
          // suggested_model/caste; feeds the circuit breaker that was accepting
          // this exact shape but never receiving a real check function.
          const colonyHealthCheck = (): { grade: import('../../core/colony/colony-signals.js').HealthGrade } => ({
            grade: getColonySignals(store.getStats()).colony_health_grade,
          })
          const result = await runAutopilot(port, {
            maxIterations,
            implement,
            beforeImplement,
            onFailure,
            onHarvest,
            colonyHealthCheck,
          })

          for (const s of result.steps) {
            const icon = s.action === 'done' ? '✓' : s.action === 'escalated' ? '⚠' : '→'
            progress(`${icon} ${s.nodeId}  ${s.title}  [${s.action}] ${s.detail}`)
          }
          progress(
            `\nResumo: ${result.completed} concluída(s), ${result.escalated} escalada(s). Parou: ${result.stopped}`,
          )

          // runAutopilot is deliberately pure ("sem efeitos colaterais além do
          // port") — the on_circuit_break emission belongs here, in the
          // caller, not inside the loop itself.
          if (result.stopped === 'colony_critical' || result.stopped === 'colony_degraded') {
            emitCircuitBreakHook({ scope: 'colony-health', stopped: result.stopped })
          }

          const tokensData = ledger
            ? (() => {
                const totals = ledger.totals()
                progress(
                  `\nTokens (sessão): ${totals.total} (in ${totals.tokensIn} / out ${totals.tokensOut}) em ${totals.calls} chamada(s)`,
                )
                for (const t of ledger.tasks()) {
                  progress(
                    `  ${t.nodeId}: ${t.total} tok (in ${t.tokensIn} / out ${t.tokensOut}, ${t.calls} chamada(s))`,
                  )
                }
                if (result.completed > 0) {
                  progress(`  média/task concluída: ${Math.round(totals.total / result.completed)} tok`)
                }
                let sessionId: string | undefined
                let rows = 0
                let cacheHits = 0
                if (totals.calls > 0) {
                  sessionId = `autopilot_${randomUUID().replace(/-/g, '').slice(0, 12)}`
                  // persistLedger grava as linhas de chamada + a economia (cache/levers)
                  // numa única costura — não chamar recordCacheHitEvents aqui (duplicaria).
                  rows = persistLedger(store.getDb(), ledger, { sessionId, provider: 'copilot' })
                  cacheHits = ledger.entries().filter((e) => (e.savedTokens ?? 0) > 0).length
                  progress(
                    `  ${rows} chamada(s) persistida(s) (session ${sessionId})${cacheHits > 0 ? `, ${cacheHits} cache hit(s)` : ''}`,
                  )
                }
                return {
                  total: totals.total,
                  tokensIn: totals.tokensIn,
                  tokensOut: totals.tokensOut,
                  calls: totals.calls,
                  sessionId,
                  persistedRows: rows,
                  cacheHits,
                }
              })()
            : undefined

          if (!opts.simulate && !opts.live && result.stopped === 'escalation') {
            progress('\nDica: --simulate exercita o loop + gate DoD; --live invoca o modelo real via SDK do Copilot.')
          }

          out.ok({
            completed: result.completed,
            escalated: result.escalated,
            stopped: result.stopped,
            steps: result.steps.map((s) => ({ nodeId: s.nodeId, title: s.title, action: s.action, detail: s.detail })),
            tokens: tokensData,
            context_reduction_pct: result.contextReductionPct ?? 0,
          })
        } catch (err) {
          out.err('AUTOPILOT_FAILED', err instanceof Error ? err.message : String(err))
        } finally {
          await flushHooks(store)
          try {
            runImmuneCycle(store.getDb(), store.getProject()?.id ?? 'default', [], 'autopilot')
          } catch {
            /* immune cycle never breaks autopilot */
          }
          maybeRunMemoryDynamicsTick(store)
          store.close()
        }
      },
    )
}
