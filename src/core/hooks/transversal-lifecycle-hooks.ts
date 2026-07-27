/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC Unified Hook Surface (Task 2.6) — dispatch dos hooks transversais.
 * Liga pre_node_status_change (validação de status_flow), on_gate_check
 * (avaliação de gate) e on_dependency_resolved (engine de pull/next) ao HookBus
 * compartilhado. A capacidade já existe — aqui só emitimos. Guardado por
 * AGF_HOOKS=0; emitSync isola erros de handler, então byte-identical sem handler.
 */

import { getSharedHookBus } from './shared-hook-bus.js'
import { hooksDisabled } from './hook-runtime.js'
import { resolveHookChannel } from './hook-types.js'

/** Pontos da taxonomia transversal (Fase H + dependency). */
export type TransversalHookPoint = 'pre_node_status_change' | 'on_gate_check' | 'on_dependency_resolved'

/** Payload de um hook transversal — campos livres (nodeId, from, to, phase, etc.). */
export interface TransversalHookPayload {
  [key: string]: unknown
}

/**
 * Emite um hook transversal no HookBus compartilhado.
 * No-op se os hooks estão desabilitados (AGF_HOOKS=0). Nunca lança ao caller.
 */
export function emitTransversalHook(point: TransversalHookPoint, payload: TransversalHookPayload): void {
  if (hooksDisabled()) return
  const channel = resolveHookChannel(point)
  getSharedHookBus().emitSync({
    channel,
    timestamp: new Date().toISOString(),
    payload,
  })
}
