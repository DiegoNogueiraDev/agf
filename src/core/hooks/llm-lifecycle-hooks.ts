/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC Unified Hook Surface (Task 2.1) — dispatch dos hooks de fase LLM.
 * Liga os pontos pre/post_llm_call, on_llm_error, on_llm_retry ao HookBus
 * compartilhado. A capacidade (retry/failover/circuit/ledger) já existe — aqui
 * só emitimos. Guardado por AGF_HOOKS=0; emitSync isola erros de handler, então
 * o comportamento é byte-identical quando não há handler.
 */

import { getSharedHookBus } from './shared-hook-bus.js'
import { hooksDisabled } from './hook-runtime.js'
import { resolveHookChannel } from './hook-types.js'

/** Pontos da taxonomia da fase LLM (Fase C). */
export type LlmHookPoint = 'pre_llm_call' | 'post_llm_call' | 'on_llm_error' | 'on_llm_retry'

/** Payload de um hook LLM — provider/model + campos livres (tokens, erro, tentativa). */
export interface LlmHookPayload {
  provider?: string
  model?: string
  [key: string]: unknown
}

/**
 * Emite um hook de fase LLM no HookBus compartilhado.
 * No-op se os hooks estão desabilitados (AGF_HOOKS=0 / MCP_GRAPH_HOOKS_DISABLED).
 * Nunca lança ao caller — erros de handler são isolados pelo HookBus (emitSync).
 */
export function emitLlmHook(point: LlmHookPoint, payload: LlmHookPayload): void {
  if (hooksDisabled()) return
  const channel = resolveHookChannel(point)
  getSharedHookBus().emitSync({
    channel,
    timestamp: new Date().toISOString(),
    payload,
  })
}
