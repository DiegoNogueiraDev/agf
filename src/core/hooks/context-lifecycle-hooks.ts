/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC Unified Hook Surface (Task 2.2) — dispatch dos hooks de fase Contexto.
 * Liga pre/post_context_build (montagem do TaskContext) e on_context_change
 * (detecção de mudança via ContextCheckpoint) ao HookBus compartilhado.
 * A capacidade já existe — aqui só emitimos. Guardado por AGF_HOOKS=0; emitSync
 * isola erros de handler, então o comportamento é byte-identical sem handler.
 */

import { getSharedHookBus } from './shared-hook-bus.js'
import { hooksDisabled } from './hook-runtime.js'
import { resolveHookChannel } from './hook-types.js'

/** Pontos da taxonomia da fase Contexto (Fase B). */
export type ContextHookPoint = 'pre_context_build' | 'post_context_build' | 'on_context_change'

/** Payload de um hook de contexto — nodeId + campos livres (tokens, epoch, etc.). */
export interface ContextHookPayload {
  nodeId?: string
  [key: string]: unknown
}

/**
 * Emite um hook de fase Contexto no HookBus compartilhado.
 * No-op se os hooks estão desabilitados (AGF_HOOKS=0). Nunca lança ao caller.
 */
export function emitContextHook(point: ContextHookPoint, payload: ContextHookPayload): void {
  if (hooksDisabled()) return
  const channel = resolveHookChannel(point)
  getSharedHookBus().emitSync({
    channel,
    timestamp: new Date().toISOString(),
    payload,
  })
}
