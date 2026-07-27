/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * decision-fast-path — o replay de custo-zero do Learning Compiler (JIT).
 *
 * Consultado ANTES de qualquer decisão LLM no caminho de roteamento: se a
 * decisão já foi compilada (ver [[learning-compiler]]), retorna-a direto da
 * [[decision-table-store]] sem chamar o LLM, atualiza `last_used_at`, e reporta
 * a economia (gravável no `llm_call_ledger` via {@link recordFastPathSaving}).
 * Em miss, executa o fallback (o roteamento/decisão LLM existente) inalterado —
 * zero mudança de comportamento quando não há regra compilada.
 *
 * Determinístico: `now` é injetável (sem Date.now() no caminho de decisão).
 */
import type { Database } from 'better-sqlite3'
import type { DecisionContext } from './decision-key.js'
import { decisionKey } from './decision-key.js'
import type { DecisionTableStore } from './decision-table-store.js'
import { recordModelCall } from '../observability/llm-call-ledger.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'decision-fast-path.ts' })

/** Info passada ao callback {@link FastPathOptions.onHit} num replay. */
export interface FastPathHit {
  key: string
  decision: unknown
  estimatedTokensSaved: number
}

export interface FastPathOptions {
  /** "Agora" (ms) para o bump de `last_used_at`. Default `Date.now()`. */
  now?: number
  /** Tokens que a chamada LLM evitada teria custado — para atribuição da economia. Default 0. */
  estimatedTokensSaved?: number
  /** Chamado num hit (ex.: gravar a economia no ledger via {@link recordFastPathSaving}). */
  onHit?: (hit: FastPathHit) => void
}

export interface FastPathResult<T> {
  /** A decisão (compilada num hit; o retorno do fallback num miss). */
  decision: T
  /** `true` se servida pelo fast-path (sem LLM); `false` se veio do fallback. */
  fromFastPath: boolean
  /** A chave determinística consultada. */
  key: string
}

/**
 * Resolve uma decisão pelo fast-path, caindo no `fallback` em miss.
 *
 * @param context Contexto que identifica a decisão (será chaveado).
 * @param store Store de decisões compiladas.
 * @param fallback A decisão cara/LLM existente — só executada em miss.
 * @param opts Opções (now, economia estimada, callback de hit).
 */
export function resolveDecision<T>(
  context: DecisionContext,
  store: DecisionTableStore,
  fallback: () => T,
  opts: FastPathOptions = {},
): FastPathResult<T> {
  const key = decisionKey(context)
  const hit = store.get(key)

  if (hit) {
    const now = opts.now ?? Date.now()
    store.markUsed(key, now)
    const estimatedTokensSaved = opts.estimatedTokensSaved ?? 0
    opts.onHit?.({ key, decision: hit.decision, estimatedTokensSaved })
    log.debug('fast-path:hit', { key, estimatedTokensSaved })
    return { decision: hit.decision as T, fromFastPath: true, key }
  }

  return { decision: fallback(), fromFastPath: false, key }
}

/**
 * Grava a economia de um hit de fast-path no `llm_call_ledger` como uma linha
 * de custo-zero: nenhum token gasto, e os tokens evitados atribuídos em
 * `cached_input_tokens` para rastreabilidade da economia por task/sessão.
 */
export function recordFastPathSaving(
  db: Database,
  args: { sessionId: string; key: string; tokensSaved: number; projectId?: string; nodeId?: string },
): void {
  recordModelCall(db, {
    sessionId: args.sessionId,
    projectId: args.projectId,
    nodeId: args.nodeId,
    caller: 'learning-fast-path',
    provider: 'fast-path',
    model: 'compiled-decision',
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: args.tokensSaved,
    costUsd: 0,
    status: 'compiled_hit',
  })
}
