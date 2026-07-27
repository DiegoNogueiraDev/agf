/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC Unified Hook Surface (Task 2.5) — dispatch dos hooks de memória/aprendizado.
 * Liga pre/post_compact (compaction-pipeline), on_learning_compile (learning-compiler)
 * e on_feedback (sqlite-learning-store) ao HookBus compartilhado. A capacidade já
 * existe — aqui só emitimos. Guardado por AGF_HOOKS=0; emitSync isola erros de
 * handler, então byte-identical sem handler.
 */

import { getSharedHookBus } from './shared-hook-bus.js'
import { hooksDisabled } from './hook-runtime.js'
import { resolveHookChannel } from './hook-types.js'

/** Pontos da taxonomia da fase Memória & Aprendizado (Fase G). */
export type MemoryLearningHookPoint = 'pre_compact' | 'post_compact' | 'on_learning_compile' | 'on_feedback'

/** Payload de um hook de memória/aprendizado — campos livres. */
export interface MemoryLearningHookPayload {
  [key: string]: unknown
}

/**
 * Emite um hook de fase Memória/Aprendizado no HookBus compartilhado.
 * No-op se os hooks estão desabilitados (AGF_HOOKS=0). Nunca lança ao caller.
 */
export function emitMemoryLearningHook(point: MemoryLearningHookPoint, payload: MemoryLearningHookPayload): void {
  if (hooksDisabled()) return
  const channel = resolveHookChannel(point)
  getSharedHookBus().emitSync({
    channel,
    timestamp: new Date().toISOString(),
    payload,
  })
}
