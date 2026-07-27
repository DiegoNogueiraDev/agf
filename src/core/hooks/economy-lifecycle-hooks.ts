/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC Unified Hook Surface (Task 2.3) — dispatch dos hooks de fase Economia.
 * Liga pre/post_compress, on_cache_hit, on_cache_miss e on_budget_warning ao
 * HookBus compartilhado. A capacidade (economy-orchestrator, response-cache,
 * budget-guard) já existe — aqui só emitimos. Guardado por AGF_HOOKS=0; emitSync
 * isola erros de handler, então byte-identical sem handler.
 */

import { getSharedHookBus } from './shared-hook-bus.js'
import { hooksDisabled } from './hook-runtime.js'
import { resolveHookChannel } from './hook-types.js'

/** Pontos da taxonomia da fase Economia (Fase E). */
export type EconomyHookPoint = 'pre_compress' | 'post_compress' | 'on_cache_hit' | 'on_cache_miss' | 'on_budget_warning'

/** Payload de um hook de economia — campos livres (lever, saved, ratio, key, etc.). */
export interface EconomyHookPayload {
  [key: string]: unknown
}

/**
 * Emite um hook de fase Economia no HookBus compartilhado.
 * No-op se os hooks estão desabilitados (AGF_HOOKS=0). Nunca lança ao caller.
 */
export function emitEconomyHook(point: EconomyHookPoint, payload: EconomyHookPayload): void {
  if (hooksDisabled()) return
  const channel = resolveHookChannel(point)
  getSharedHookBus().emitSync({
    channel,
    timestamp: new Date().toISOString(),
    payload,
  })
}
