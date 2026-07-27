/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * ant-swarming `run` — o comando de VALOR: dirige a colônia inteira a custo baixo.
 *
 * PORQUÊ: percorre a fila já planejada pelo modelo frontier ocupando formigas
 * baratas. COMPÕE o que JÁ EXISTE (do not recreate): runAntCycle (T4, um ciclo
 * claim→brief→tier→exec→done), findNextTask (mesmo picker do `agf next`),
 * sweepStaleLeases (recicla locks expirados) e BudgetGuard (teto global).
 *
 * STOP RULE: fila vazia OU budget global esgotado. Cada round varre leases
 * expiradas e RECICLA tasks órfãs (in_progress sem lock vivo = formiga morta →
 * volta ao pool), então outra formiga a completa. Relatório final traz
 * tasks fechadas/bloqueadas + custo por task do llm_call_ledger.
 *
 * ISOLAMENTO: importa SÓ de core/swarming (nunca ../cli/../tui).
 */

import type { SqliteStore } from '../core/store/sqlite-store.js'
import { findNextTask } from '../core/planner/next-task.js'
import { sweepStaleLeases } from '../core/planner/sweep-stale-leases.js'
import type { BudgetGuard } from '../core/autonomy/budget-guard.js'
import { runAntCycle, type AntLlmPort } from './ant-runner.js'

/** Cap de segurança de rounds — nunca deve ser atingido (a fila seca antes). */
const DEFAULT_MAX_ROUNDS = 1000

export interface RunColonyDeps {
  store: SqliteStore
  /** Factory de LLM por ciclo — cada formiga recebe seu próprio adapter/stub. */
  makeLlm: () => AntLlmPort
  /** Teto GLOBAL de tokens compartilhado por toda a colônia. */
  budget: BudgetGuard
  /** Nº de formigas (rotação do agentId ant-1..ant-N). */
  ants: number
  agentPrefix?: string
  maxRounds?: number
}

export interface TaskCost {
  nodeId: string
  tokens: number
  costUsd: number
}

export interface RunColonyResult {
  tasksClosed: number
  tasksBlocked: number
  rounds: number
  /** Tasks órfãs recicladas ao pool (formigas mortas). */
  reclaimed: number
  /** Custo por task do llm_call_ledger (atribuição real). */
  perTaskCost: TaskCost[]
}

function tableExists(store: SqliteStore, name: string): boolean {
  return Boolean(store.getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name))
}

/**
 * Recicla tasks presas em `in_progress` sem lock vivo (formiga morta): volta ao
 * pool (backlog) para findNextTask redistribuir. Roda DEPOIS de sweepStaleLeases
 * (que já removeu os locks expirados), então "sem lock" == órfã de verdade.
 */
function reclaimOrphanedTasks(store: SqliteStore): number {
  const hasLocks = tableExists(store, 'resource_locks')
  const db = store.getDb()
  let reclaimed = 0
  for (const task of store.getNodesByStatus('in_progress')) {
    const locked = hasLocks
      ? db.prepare('SELECT 1 FROM resource_locks WHERE resource_id = ? LIMIT 1').get(task.id)
      : undefined
    if (!locked) {
      store.updateNodeStatus(task.id, 'backlog')
      reclaimed++
    }
  }
  return reclaimed
}

/** Custo por task agregado do ledger (0 linhas quando delegate-first/stub). */
function perTaskCostFromLedger(store: SqliteStore): TaskCost[] {
  if (!tableExists(store, 'llm_call_ledger')) return []
  return store
    .getDb()
    .prepare(
      `SELECT node_id AS nodeId,
              SUM(input_tokens + output_tokens) AS tokens,
              SUM(cost_usd) AS costUsd
         FROM llm_call_ledger
        WHERE node_id IS NOT NULL
        GROUP BY node_id`,
    )
    .all() as TaskCost[]
}

/**
 * Dirige a colônia até a fila secar ou o budget global estourar. Retorna o
 * relatório (fechadas/bloqueadas/recicladas + custo por task). AC3: fila vazia
 * encerra no round 0 sem chamar LLM (runAntCycle nem é invocado).
 */
export async function runColony(deps: RunColonyDeps): Promise<RunColonyResult> {
  const prefix = deps.agentPrefix ?? 'ant'
  const antCount = Math.max(deps.ants, 1)
  const maxRounds = deps.maxRounds ?? DEFAULT_MAX_ROUNDS

  let tasksClosed = 0
  let tasksBlocked = 0
  let reclaimed = 0
  let rounds = 0

  while (rounds < maxRounds) {
    if (deps.budget.exceeded()) break

    // Locks expirados somem; tasks órfãs voltam ao pool antes de repuxar a fila.
    sweepStaleLeases(deps.store.getDb())
    reclaimed += reclaimOrphanedTasks(deps.store)

    if (!findNextTask(deps.store.toGraphDocument())) break // fila vazia → stop

    const agentId = `${prefix}-${(rounds % antCount) + 1}`
    const result = await runAntCycle({ store: deps.store, llm: deps.makeLlm(), budget: deps.budget, agentId })
    rounds++

    if (result.status === 'done') tasksClosed++
    else if (result.status === 'blocked') tasksBlocked++
    else if (result.status === 'budget_exhausted' || result.status === 'no_task') break
  }

  return { tasksClosed, tasksBlocked, rounds, reclaimed, perTaskCost: perTaskCostFromLedger(deps.store) }
}
