/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Fábrica do passo de implementação ao vivo (M1r) — monta o client tiered
 * (Copilot SDK) + repo-map + executor + token-ledger num único `implement` hook
 * reutilizável pelo `autopilot --live` (CLI) e pela TUI. Extraído de
 * `autopilot-cmd` para evitar duplicação; comportamento idêntico.
 */
import { buildClientFromProject } from './provider-context.js'
import { executePlan, defaultRunner } from '../../core/autonomy/implementation-executor.js'
import { attemptImplementation, STABLE_SYSTEM_PROMPT } from '../../core/autonomy/implement-attempt.js'
import { guardExecRunner, type ExecRule, type ExecEffect } from '../../core/autonomy/exec-policy.js'
import { renderPlanDiff } from '../../tui/diff-render.js'
import { type TokenLedger } from '../../core/autonomy/token-ledger.js'
import { prepareTask, finalizeTask } from '../../core/autonomy/task-prep.js'
import { CodeStore } from '../../core/code/code-store.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { emitEconomyHook } from '../../core/hooks/economy-lifecycle-hooks.js'
import { maybeRunMemoryDynamicsTick } from '../../core/rag/memory-dynamics-tick.js'
import { routeTierLearned, recordLearnedDecision, LEARNED_ROUTING_LEVER } from '../../core/model-hub/learned-router.js'
import { isLeverEnabled, resolveEconomyLeversConfig } from '../../core/economy/economy-levers-config.js'
import type { RouterConfig } from '../../core/model-hub/tier-router.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'live-implement.ts' })

export interface LiveImplementOptions {
  store: SqliteStore
  /** Workspace onde o plano é aplicado e os testes rodam. */
  dir: string
  /** Comando de teste default quando o plano não traz um. */
  testCmd: string
  /** Tentativas por task (retry com feedback compacto). */
  retries: number
  /** Ledger acumulador (medição de tokens/custo). */
  ledger: TokenLedger
  /** Sink de log opcional (CLI imprime; TUI anexa ao painel). */
  onLog?: (msg: string) => void
}

export interface LiveImplement {
  /** Hook `implement` para o `runAutopilot` / `attemptImplementation`. */
  implement: (node: { id: string; title: string }) => Promise<boolean>
  /** Quantidade de símbolos indexados disponíveis ao repo-map. */
  repoSymbolCount: number
}

/**
 * Constrói o `implement` ao vivo: por task, monta o repo-map (foco no título),
 * gera o plano via modelo, aplica e roda testes, medindo tokens no ledger.
 */
export function buildLiveImplement(options: LiveImplementOptions): LiveImplement {
  log.debug('building live implementer')
  const { store, dir, testCmd, retries, ledger, onLog } = options

  // Contexto de provider único (provider+base-url+model+cache persistidos do projeto).
  const { client, providerId, providerLabel } = buildClientFromProject(store)
  onLog?.(`[live] provider: ${providerLabel}`)
  const maxAttempts = Math.max(1, retries)

  // Lever `learned_routing` (opt-in, default OFF ⇒ tier heurístico byte-idêntico):
  // o roteador outcome-driven (bandit UCB1) aprende o tier certo por tipo de task.
  const learnedRoutingOn = isLeverEnabled(resolveEconomyLeversConfig(store), LEARNED_ROUTING_LEVER)
  const modelSetting = store.getProjectSetting('model') ?? 'auto'
  const routerConfig: RouterConfig =
    modelSetting === 'auto' ? { mode: 'auto' } : { mode: 'pinned', modelId: modelSetting }

  // Exec-policy: comandos perigosos (built-in DEFAULT_DENY) são sempre barrados;
  // default "allow" preserva o comportamento atual (npm test roda). Override via
  // setting JSON `exec_policy` = { default?, rules? }. §node_fbd1bc7467c3
  let execRules: ExecRule[] = []
  let execDefault: ExecEffect = 'allow'
  const rawPolicy = store.getProjectSetting('exec_policy')
  if (rawPolicy) {
    try {
      const parsed = JSON.parse(rawPolicy) as { default?: ExecEffect; rules?: ExecRule[] }
      if (parsed.default) execDefault = parsed.default
      if (Array.isArray(parsed.rules)) execRules = parsed.rules
    } catch {
      /* setting corrompido → defaults seguros */
    }
  }
  const guardedRunner = guardExecRunner(defaultRunner, { rules: execRules, defaultEffect: execDefault })

  // Repo-map: símbolos indexados do projeto (uma vez por sessão; foco por task).
  const codeStore = new CodeStore(store.getDb())
  const projectId = store.getProject()?.id
  const repoSymbols = projectId ? codeStore.getAllSymbols(projectId) : []
  const repoRelations = projectId ? codeStore.getAllRelations(projectId) : []

  const implement = async (node: { id: string; title: string }): Promise<boolean> => {
    // Prepare (shared with the delegate brief): repo-map + flow + reuse. The
    // ledger turns the repo-map/flow input-cuts into levers; the once-per-session
    // symbols are passed through so the hot path never re-queries the code store.
    const prep = await prepareTask(store, node, { repoSymbols, repoRelations, ledger, onLog })

    // Decide the model tier once per task. With the lever OFF this stays undefined,
    // so client.run/modelFor fall back to the exact heuristic (byte-identical). The
    // taskType key mirrors finalizeTask (node.type) so the reward join lines up.
    let learnedTier: import('../../core/model-hub/tier-router.js').ModelTier | undefined
    if (learnedRoutingOn) {
      const taskType = store.getNodeById?.(node.id)?.type ?? ''
      const decision = routeTierLearned(
        { db: store.getDb(), leversSource: store, routerConfig, providerId },
        { kind: 'implement', taskType },
      )
      learnedTier = decision.tier
      if (decision.source === 'learned' || decision.tier !== decision.heuristicTier) {
        onLog?.(
          `  [route] learned tier=${decision.tier} (heuristic=${decision.heuristicTier}, ${decision.recommendation?.reason})`,
        )
      }
      recordLearnedDecision(store.getDb(), {
        sessionId: `route_${node.id}`,
        nodeId: node.id,
        heuristicTier: decision.heuristicTier,
        chosenTier: decision.tier,
      })
    }

    const outcome = await attemptImplementation(
      {
        generate: async (prompt, effort) => {
          // Frente B: system estável (prefixo cacheável); prompt = cauda volátil.
          // Frente C: esforço de raciocínio condicional (default enxuto, escala no retry).
          const res = await client.run(
            'implement',
            prompt,
            STABLE_SYSTEM_PROMPT,
            undefined,
            effort,
            undefined,
            learnedTier,
          )
          // medição: tokens reportados pelo SDK, senão estima por chars/4
          ledger.recordCall(node.id, {
            model: res.model,
            prompt,
            response: res.text,
            reportedIn: res.tokensIn,
            reportedOut: res.tokensOut,
            reportedCachedIn: res.cachedTokensIn,
            reportedReasoning: res.reasoningTokens,
            fromCache: res.fromCache,
          })
          if (res.fromCache) {
            onLog?.(`  [cache] resposta local reaproveitada — 0 token`)
            // WS-C / T2.1: dispara on_cache_hit na via ativa (no-op sem handler).
            emitEconomyHook('on_cache_hit', { lever: 'response_cache', nodeId: node.id, model: res.model })
          }
          return res.text
        },
        execute: (plan) =>
          executePlan(plan, { workspaceDir: dir, defaultTestCommand: testCmd, runCommand: guardedRunner }),
      },
      { node, maxAttempts, repoMap: prep.repoMap, flowContext: prep.flowContext, reuse: prep.reuse },
    )

    if (outcome.reused === 'exact') {
      onLog?.(`  [reuse] exact verde — 0 tokens de modelo`)
    }

    const files = outcome.lastResult?.applied.length ?? 0
    const task = ledger.byTask(node.id)
    onLog?.(
      `  [live] ${client.modelFor('implement', undefined, learnedTier)}: ${outcome.attempts} tentativa(s), ${files} arquivo(s), ${task.total} tok → ${outcome.success ? 'verde' : 'escala'}`,
    )

    // Diff das edições aplicadas (F2): mostra o que mudou.
    if (outcome.success && outcome.appliedEdits && outcome.appliedEdits.length > 0) {
      for (const line of renderPlanDiff(outcome.appliedEdits)) onLog?.(line)
    }

    // Finalize (shared with the delegate submit): episodic outcome + artifact cache
    // + learning signal + the artifact_reuse lever. Best-effort — never breaks the loop.
    finalizeTask(
      store,
      node,
      {
        success: outcome.success,
        appliedEdits: outcome.appliedEdits,
        touchedFiles: outcome.lastResult?.applied ?? [],
        signature: prep.signature,
        model: client.modelFor('implement', undefined, learnedTier),
        ...(outcome.reused !== undefined ? { reused: outcome.reused } : {}),
        acPassed: outcome.success,
      },
      { ledger },
    )

    maybeRunMemoryDynamicsTick(store)
    return outcome.success
  }

  return { implement, repoSymbolCount: repoSymbols.length }
}
