/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC Unified Hook Surface (Task 3.2) — API programática de registro de hooks.
 * Registra handlers em qualquer um dos 28 canais sobre o HookBus compartilhado,
 * com ORDEM DE PRIORIDADE determinística (lower = earlier). Mantém um dispatcher
 * único por canal no bus; a ordenação vive nesta camada (o HookBus usa Set sem
 * prioridade). Retorna uma função de unregister.
 *
 * Nota (finding node_ea0f86630c0e): os canais de task que emitem pelo store-bus
 * (task:pre-execute/post-complete/error/pre-done, tool:*) ainda não chegam aqui;
 * a ponte store-bus → shared-bus é trabalho de follow-up.
 */

import { getSharedHookBus } from './shared-hook-bus.js'
import { hooksDisabled } from './hook-runtime.js'
import { assertHookChannel, allow, reduceHookResults } from './hook-types.js'
import type { HookChannel, HookEvent, HookHandler, HookActionResult } from './hook-types.js'
import { aggregateHandlerStats } from './handler-stats.js'
import type { HandlerCallRecord, HandlerStats } from './handler-stats.js'

/** Handler programático: pode ser sync ou async; retorno opcional (action model). */
export type RegisteredHookHandler = (
  event: HookEvent,
) => HookActionResult | undefined | Promise<HookActionResult | undefined>

export interface RegisterHookOptions {
  /** Menor = executa antes. Default 0. */
  priority?: number
  /** Identificador opcional (debug). */
  id?: string
}

interface Entry {
  handler: RegisteredHookHandler
  priority: number
  id?: string
}

const registry = new Map<HookChannel, Entry[]>()
const dispatchers = new Map<HookChannel, HookHandler>()

// Ring buffer of raw per-handler call records, feeding aggregateHandlerStats
// for `agf hooks stats`. Capped so long-running processes don't leak memory.
const MAX_CALL_RECORDS = 1000
const callRecords: HandlerCallRecord[] = []

function recordHandlerCall(handlerId: string, durationMs: number, ok: boolean, errorMessage?: string): void {
  callRecords.push({ handlerId, durationMs, ok, errorMessage, ts: Date.now() })
  if (callRecords.length > MAX_CALL_RECORDS) callRecords.splice(0, callRecords.length - MAX_CALL_RECORDS)
}

/**
 * Registra um handler num canal. Lança UnknownHookChannelError se o canal for
 * inválido. Retorna uma função que remove o registro.
 */
export function registerHook(
  channel: string,
  handler: RegisteredHookHandler,
  opts: RegisterHookOptions = {},
): () => void {
  const ch = assertHookChannel(channel)

  // Instala um dispatcher único por canal no bus compartilhado (idempotente).
  if (!dispatchers.has(ch)) {
    const dispatcher: HookHandler = async (event: HookEvent): Promise<void> => {
      const entries = registry.get(ch) ?? []
      // Chamada SÍNCRONA em ordem de prioridade — handlers sync completam já,
      // preservando a ordem sob emitSync. A cauda async (se houver) é isolada.
      // Cópia defensiva — um handler pode (des)registrar durante o dispatch.
      for (const entry of [...entries]) {
        const handlerId = entry.id ?? ch
        const start = Date.now()
        let r: ReturnType<RegisteredHookHandler>
        try {
          r = entry.handler(event)
        } catch (err) {
          recordHandlerCall(handlerId, Date.now() - start, false, err instanceof Error ? err.message : String(err))
          throw err
        }
        if (r && typeof (r as Promise<unknown>).then === 'function') {
          void (r as Promise<unknown>).then(
            () => recordHandlerCall(handlerId, Date.now() - start, true),
            (err: unknown) =>
              recordHandlerCall(handlerId, Date.now() - start, false, err instanceof Error ? err.message : String(err)),
          )
        } else {
          recordHandlerCall(handlerId, Date.now() - start, true)
        }
      }
    }
    dispatchers.set(ch, dispatcher)
    getSharedHookBus().on(ch, dispatcher)
  }

  const entry: Entry = { handler, priority: opts.priority ?? 0, id: opts.id }
  const list = registry.get(ch) ?? []
  list.push(entry)
  // Estável por prioridade (lower = earlier); insertion order para empates.
  list.sort((a, b) => a.priority - b.priority)
  registry.set(ch, list)

  return () => {
    const current = registry.get(ch)
    if (!current) return
    const idx = current.indexOf(entry)
    if (idx >= 0) current.splice(idx, 1)
  }
}

/** Quantos handlers registrados num canal (debug/inspeção). */
export function registeredHookCount(channel: string): number {
  return registry.get(assertHookChannel(channel))?.length ?? 0
}

/**
 * Despacha um canal coletando os retornos SÍNCRONOS dos handlers e aplicando
 * {@link reduceHookResults} (precedência halt > deny > modify > record > allow).
 * Handlers assíncronos não participam do enforcement (só `record` por design).
 * No-op → `allow` quando não há handler ou AGF_HOOKS=0 (byte-identical).
 */
export function dispatchHookWithResult(channel: string, payload: Record<string, unknown>): HookActionResult {
  if (hooksDisabled()) return allow()
  const ch = assertHookChannel(channel)
  const entries = registry.get(ch)
  if (!entries || entries.length === 0) return allow()
  const event: HookEvent = { channel: ch, timestamp: new Date().toISOString(), payload }
  const results: HookActionResult[] = []
  for (const entry of [...entries]) {
    const r = entry.handler(event)
    // Só resultados síncronos com shape de HookActionResult contam.
    if (r && typeof r === 'object' && !(r instanceof Promise) && 'action' in r) {
      results.push(r as HookActionResult)
    }
  }
  return reduceHookResults(results)
}

/** Per-handler call stats (count, p50/p95 duration, last error) for `agf hooks stats`. */
export function getHandlerStats(): HandlerStats[] {
  return aggregateHandlerStats({ records: callRecords })
}

/** Test-only: limpa todos os registros + dispatchers + call records. */
export function _resetRegisteredHooks(): void {
  registry.clear()
  dispatchers.clear()
  callRecords.length = 0
}
