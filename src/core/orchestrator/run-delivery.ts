/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_fd76d454494c — Loop de orquestração end-to-end. Repete
 * `nextDeliveryAction` sobre o estado do grafo e despacha o handler correspondente
 * (importPrd/decompose/implement) até `done`/`escalate`, com teto de passos
 * (cost-runaway) e cancelamento cooperativo. Puro por injeção — o `build`
 * fornece handlers reais; os testes usam fakes (0 token de LLM).
 */

import type { AbortLike } from '../autonomy/autopilot-loop.js'
import { nextDeliveryAction, type DeliveryState, type DeliveryAction } from './orchestrator.js'

export interface DeliveryHandlers {
  importPrd: () => Promise<void>
  decompose: () => Promise<void>
  implement: () => Promise<void>
}

export interface RunDeliveryOptions {
  /** Teto de passos do orquestrador (cost-runaway). */
  maxSteps: number
  /** Cancelamento cooperativo (ex.: AbortSignal). */
  signal?: AbortLike
  /** Callback por passo (UI ao vivo). */
  onStep?: (step: { action: DeliveryAction; reason: string }) => void
}

export type DeliveryStopReason = 'done' | 'escalation' | 'budget' | 'aborted' | 'stalled'

export interface DeliveryReport {
  steps: number
  stopped: DeliveryStopReason
  actions: DeliveryAction[]
}

/**
 * Executa o pipeline de entrega até concluir, escalar, estourar o budget ou ser
 * cancelado. Determinístico dado `getState` + handlers.
 */
export async function runDelivery(
  getState: () => DeliveryState,
  handlers: DeliveryHandlers,
  options: RunDeliveryOptions,
): Promise<DeliveryReport> {
  const actions: DeliveryAction[] = []
  // Guarda de não-progresso: se a mesma ação é pedida sobre um estado idêntico
  // (ex.: decompose que não decompõe nada), o loop estagnaria até o budget. Detecta
  // a repetição (ação + fingerprint do estado) e para como 'stalled' — termina
  // limpo em vez de queimar passos. Ação que avança muda o estado → sem falso stall.
  let lastKey = ''

  for (let step = 0; step < options.maxSteps; step++) {
    if (options.signal?.aborted === true) {
      return { steps: step, stopped: 'aborted', actions }
    }

    const state = getState()
    const decision = nextDeliveryAction(state)
    options.onStep?.(decision)

    if (decision.action === 'done') {
      return { steps: step, stopped: 'done', actions }
    }
    if (decision.action === 'escalate') {
      return { steps: step, stopped: 'escalation', actions }
    }

    const key = `${decision.action}|${JSON.stringify(state)}`
    if (key === lastKey) {
      return { steps: step, stopped: 'stalled', actions }
    }
    lastKey = key

    actions.push(decision.action)
    if (decision.action === 'import_prd') await handlers.importPrd()
    else if (decision.action === 'decompose') await handlers.decompose()
    else await handlers.implement()
  }

  return { steps: options.maxSteps, stopped: 'budget', actions }
}
