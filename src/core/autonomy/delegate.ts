/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_fc2613ada953 — Orquestração de sub-agentes *gated por budget*.
 *
 * Roda subtasks SEQUENCIALMENTE (WIP=1 — sem fan-out paralelo, que estouraria
 * tokens) via um hook injetado (`runSubagent`), respeitando um TETO de tokens
 * (cost-runaway guard) e um sinal de cancelamento cooperativo. Cada sub-agente
 * recebe seu próprio contexto compacto e o budget restante, e o orquestrador
 * agrega os resultados. Inspirado no thread-forking do Codex, mas frugal: o
 * guard impede que a delegação vire um buraco de tokens.
 *
 * Puro e determinístico por injeção — testável sem SDK/modelo.
 */

import type { AbortLike } from './autopilot-loop.js'

export interface SubagentOutcome {
  success: boolean
  /** Tokens consumidos por este sub-agente (do ledger real, ou estimado). */
  tokensUsed: number
  summary?: string
}

export interface SubagentResult extends SubagentOutcome {
  id: string
  title: string
}

export interface DelegateDeps {
  /** Executa um sub-agente para a subtask, ciente do budget restante. */
  runSubagent: (subtask: { id: string; title: string }, budgetRemaining: number) => Promise<SubagentOutcome>
}

export interface DelegateOptions {
  /** Teto total de tokens (cost-runaway). `undefined` = sem teto. */
  totalBudget?: number
  /** Reserva mínima de budget para iniciar um sub-agente (default 1). */
  minBudgetPerSubagent?: number
  /** Sinal de cancelamento cooperativo (ex.: AbortSignal). */
  signal?: AbortLike
  /** Parar no primeiro sub-agente que falha (default false). */
  stopOnFailure?: boolean
  /** Callback por resultado (UI ao vivo). */
  onResult?: (result: SubagentResult) => void
}

export type DelegateStopReason = 'all_done' | 'budget_exhausted' | 'aborted' | 'failure'

export interface DelegateReport {
  results: SubagentResult[]
  completed: number
  failed: number
  tokensUsed: number
  stopped: DelegateStopReason
}

// ── Batch selection (improve-batch-tasks) ───────────────────────────────────

/** Minimal task shape needed to decide batch eligibility. */
export interface BatchableTask {
  id: string
  title: string
  /** XP size estimate; only 'S'/'XS' qualify by default. Missing = not eligible. */
  xpSize?: string
  /** True when the task has an unresolved blocker/dependency. Blocked = not eligible. */
  blocked?: boolean
}

export interface BatchSelectOptions {
  /** Máximo de tasks por lote (default 5). */
  maxBatch?: number
  /** Tamanhos elegíveis para batch (default ['XS','S']). */
  sizes?: readonly string[]
}

/** Default cap on how many small tasks group into one delegation. */
export const DEFAULT_BATCH_MAX = 5
const DEFAULT_BATCH_SIZES: readonly string[] = ['XS', 'S']

/**
 * Seleciona até N (default 5) tasks pequenas ('S'/'XS') e DESBLOQUEADAS para
 * agrupar numa única delegação. Tasks maiores (M/L/XL), bloqueadas, ou sem
 * `xpSize` explícito NÃO entram no lote.
 *
 * Seletor puro: não roda nada. WIP=1 é preservado conceitualmente — o lote é só
 * uma seleção; o chamador ainda valida/fecha cada task individualmente. Ordem de
 * entrada é preservada (estável).
 */
export function selectTaskBatch<T extends BatchableTask>(tasks: readonly T[], options: BatchSelectOptions = {}): T[] {
  const maxBatch = options.maxBatch ?? DEFAULT_BATCH_MAX
  const eligibleSizes = new Set(options.sizes ?? DEFAULT_BATCH_SIZES)

  const batch: T[] = []
  for (const task of tasks) {
    if (batch.length >= maxBatch) break
    if (task.blocked === true) continue
    if (task.xpSize === undefined || !eligibleSizes.has(task.xpSize)) continue
    batch.push(task)
  }
  return batch
}

/**
 * Delega uma lista de subtasks a sub-agentes sequenciais, gated por budget e
 * cancelamento. Não inicia um sub-agente se o budget restante for menor que a
 * reserva mínima — é o que mantém a delegação token-frugal.
 */
export async function delegateSubtasks(
  subtasks: Array<{ id: string; title: string }>,
  deps: DelegateDeps,
  options: DelegateOptions = {},
): Promise<DelegateReport> {
  const minReserve = options.minBudgetPerSubagent ?? 1
  const hasCap = typeof options.totalBudget === 'number'
  const cap = options.totalBudget ?? Infinity

  const results: SubagentResult[] = []
  let completed = 0
  let failed = 0
  let tokensUsed = 0

  for (const subtask of subtasks) {
    if (options.signal?.aborted === true) {
      return { results, completed, failed, tokensUsed, stopped: 'aborted' }
    }

    const remaining = cap - tokensUsed
    if (hasCap && remaining < minReserve) {
      return { results, completed, failed, tokensUsed, stopped: 'budget_exhausted' }
    }

    const outcome = await deps.runSubagent(subtask, remaining)
    tokensUsed += outcome.tokensUsed
    const result: SubagentResult = { id: subtask.id, title: subtask.title, ...outcome }
    results.push(result)
    options.onResult?.(result)

    if (outcome.success) {
      completed += 1
    } else {
      failed += 1
      if (options.stopOnFailure === true) {
        return { results, completed, failed, tokensUsed, stopped: 'failure' }
      }
    }
  }

  return { results, completed, failed, tokensUsed, stopped: 'all_done' }
}
