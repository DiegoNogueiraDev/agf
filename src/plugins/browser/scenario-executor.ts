/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §PRD-0200-RPA — Task 2.2: Execução E2E do cenário.
 *
 * Executa um ScenarioPlan passo-a-passo via BrowserActions (adaptador injetado —
 * tipicamente o cliente do browser agent). Após cada passo registra evidência
 * (screenshot base64). Falhas transitórias recebem 1 retry; falha persistente
 * para o cenário e retorna resultado honesto (nunca falso-sucesso). Puro no
 * sentido de que NÃO gerencia conexão/daemon — isso é responsabilidade do caller.
 * Não-pivota: AGF orquestra, browser agent executa.
 */

import type { ScenarioPlan, ScenarioStep } from './nl-scenario-compiler.js'
import type { BrowserActions, ActionResult } from './actions/index.js'
import type { StepResult } from './scenario-oracle.js'

type DispatchResult = ActionResult | { ok: false; error: string }

/**
 * Tools que são seguros para re-tentar cegamente: leituras e navegação são
 * idempotentes (re-executar não muda estado). Ações mutadoras
 * (click/type/press_key) NÃO entram — um retry cego arriscaria double-click /
 * double-type se a 1ª tentativa aplicou parcialmente antes de reportar falha.
 */
const IDEMPOTENT_TOOLS: ReadonlySet<string> = new Set(['browser_navigate', 'browser_screenshot', 'browser_js_eval'])

async function dispatch(step: ScenarioStep, actions: BrowserActions): Promise<DispatchResult> {
  try {
    return await dispatchRaw(step, actions)
  } catch (err) {
    // Adapter rejected (e.g. CDP socket dropped) instead of returning {ok:false}.
    // Convert to an honest failure so the scenario stops with partial results
    // intact — never throw away the run.
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function dispatchRaw(step: ScenarioStep, actions: BrowserActions): Promise<DispatchResult> {
  const args = step.args as Record<string, unknown>
  switch (step.tool) {
    case 'browser_navigate':
      return actions.navigate({ url: String(args.url ?? '') })
    case 'browser_click':
      return actions.click({ x: Number(args.x ?? 0), y: Number(args.y ?? 0) })
    case 'browser_type':
      return actions.type({ text: String(args.text ?? '') })
    case 'browser_press_key':
      return actions.pressKey({ key: String(args.key ?? 'Enter') })
    case 'browser_screenshot':
      return actions.screenshot({})
    case 'browser_js_eval':
      return actions.jsEval({ expression: String(args.expression ?? '') })
    default:
      return { ok: false, error: `Unknown tool: ${step.tool}` }
  }
}

async function captureEvidence(actions: BrowserActions): Promise<string | undefined> {
  // Evidence is best-effort: a failed/throwing screenshot must never discard a
  // successful step's result.
  try {
    const shot = await actions.screenshot({})
    return shot.ok ? (shot.data ?? undefined) : undefined
  } catch {
    return undefined
  }
}

/**
 * Executa cada passo do plano, coleta evidências (screenshot), aplica retry
 * simples na primeira falha, e para com resultado honesto se o retry também
 * falhar. Devolve apenas os StepResults dos passos que foram tentados.
 */
export async function executeScenario(plan: ScenarioPlan, actions: BrowserActions): Promise<StepResult[]> {
  const results: StepResult[] = []
  /** Última rota observada no run — o terminal a herda para poder ser comparada. */
  let lastObservedIdentity: string | undefined

  for (const [i, step] of plan.steps.entries()) {
    // Primeira tentativa
    let outcome = await dispatch(step, actions)

    // Retry único na falha — APENAS para tools idempotentes (strategy-rewriter:
    // transient recovery). Ações mutadoras não são re-tentadas para evitar
    // double-apply (double-click/double-type).
    if (!outcome.ok && IDEMPOTENT_TOOLS.has(step.tool ?? '')) {
      outcome = await dispatch(step, actions)
    }

    if (!outcome.ok) {
      // Falha persistente — parar com resultado honesto, PRESERVANDO a causa: o
      // consumidor precisa separar "o driver não respondeu" de "a entrega quebrou",
      // e descartar a mensagem aqui torna as duas indistinguíveis rio abaixo.
      results.push({
        tool: step.tool ?? 'unknown',
        ok: false,
        ...(typeof outcome.error === 'string' && outcome.error ? { error: outcome.error } : {}),
      })
      break
    }

    // Passo ok — capturar evidência (exceto se o step JÁ era um screenshot)
    const evidence =
      step.tool === 'browser_screenshot'
        ? ((outcome as { data?: string }).data ?? undefined)
        : await captureEvidence(actions)

    // L8 (node_902b00d0749d): o oráculo (scenario-oracle) exige um passo-conclusão com
    // pixel e identidade — populamos aqui, no PRODUTOR. Sem isto o hardening ficaria
    // dormente (todo cenário viraria inconclusive). O terminal é o ÚLTIMO passo do plano;
    // a navegação expõe a rota alcançada → observedIdentity (prova de que chegou onde deveria).
    const concludes = i === plan.steps.length - 1
    const observedIdentity =
      step.tool === 'browser_navigate' && 'url' in outcome
        ? String((outcome as { url?: unknown }).url ?? '')
        : undefined
    if (observedIdentity !== undefined) lastObservedIdentity = observedIdentity

    // O terminal é onde o oráculo compara identidade, e a rota é conhecida no passo
    // de NAVEGAÇÃO — que quase nunca é o último. Sem carregá-la até aqui, o terminal
    // ficava com `concludes` e sem `observedIdentity`, e a comparação nunca disparava.
    // `expectedIdentity` vem do plano (node_a65b6c47e1ac): quem declara é o cenário.
    const terminalIdentity = concludes
      ? {
          ...(lastObservedIdentity !== undefined ? { observedIdentity: lastObservedIdentity } : {}),
          ...(plan.expectation?.identity !== undefined ? { expectedIdentity: plan.expectation.identity } : {}),
        }
      : { ...(observedIdentity !== undefined ? { observedIdentity } : {}) }

    results.push({
      tool: step.tool ?? 'unknown',
      ok: true,
      evidence,
      ...(concludes ? { concludes: true } : {}),
      ...terminalIdentity,
    })
  }

  return results
}
