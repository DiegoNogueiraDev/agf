/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-5.T07 — MCP `learning` tool actions (pure dispatch).
 *
 * 6 actions:
 *   route   — decide an agent given history + strategy
 *   record  — append a PerfRecord
 *   stats   — aggregate (read-only)
 *   explain — full breakdown for the chosen route (read-only)
 *   export  — dump all records (read-only)
 *   import  — replace records atomically
 *
 * The MCP tool wrapper validates inputs (Zod) and routes to these actions.
 * Storage adapter (read/append/replace) is injected so this module stays
 * pure and testable in-memory.
 */

import { aggregatePerformance, trimToRecent, type AgentStats, type PerfRecord } from './performance-tracker.js'
import { explainRouting, type RouteExplanation } from './sona-router.js'
import { decideRoute, isValidStrategy, type DelegateRouteDecision, type RoutingStrategy } from './routing-strategy.js'
import { decisionKey, type DecisionObservation } from './decision-key.js'
import { compileDecisions, type CompileOptions, type CompileResult } from './learning-compiler.js'
import type { DecisionTableStore } from './decision-table-store.js'
import { InvalidArgumentError } from '../utils/errors.js'

export const LEARNING_ACTIONS = ['route', 'record', 'stats', 'explain', 'export', 'import'] as const
export type LearningAction = (typeof LEARNING_ACTIONS)[number]

export const READ_ONLY_ACTIONS: ReadonlySet<LearningAction> = new Set(['route', 'stats', 'explain', 'export'])

export interface LearningStore {
  readAll(): PerfRecord[]
  appendRecord(record: PerfRecord): void
  replaceAll(records: PerfRecord[]): void
}

/** isReadOnlyAction —  */
export function isReadOnlyAction(action: LearningAction): boolean {
  return READ_ONLY_ACTIONS.has(action)
}

/** route — returns the routing decision without mutating state. */
export function actionRoute(store: LearningStore, strategy?: RoutingStrategy): DelegateRouteDecision {
  if (strategy !== undefined && !isValidStrategy(strategy)) {
    throw new InvalidArgumentError(`learning:route — invalid strategy '${strategy}'`)
  }
  return decideRoute({ strategy, records: store.readAll() })
}

/** record — append a single PerfRecord. Returns the inserted record. */
export function actionRecord(store: LearningStore, record: PerfRecord): PerfRecord {
  if (!record.agentId) throw new InvalidArgumentError('learning:record — agentId required')
  if (!record.nodeId) throw new InvalidArgumentError('learning:record — nodeId required')
  if (!Number.isFinite(record.cycleTimeMs) || record.cycleTimeMs < 0) {
    throw new InvalidArgumentError('learning:record — cycleTimeMs must be a non-negative number')
  }
  store.appendRecord(record)
  return record
}

export interface StatsResult {
  totalRecords: number
  agents: AgentStats[]
}

/** actionStats —  */
export function actionStats(store: LearningStore): StatsResult {
  const records = store.readAll()
  return {
    totalRecords: records.length,
    agents: aggregatePerformance(records),
  }
}

/**
 * Mapeia um {@link PerfRecord} numa observação de decisão de roteamento de
 * agente: a "decisão" é rotear para `agentId`, chaveada por agente, com
 * `success = acPassed`. Registros do mesmo agente colapsam na mesma chave, de
 * modo que um agente com histórico repetido e bem-sucedido vira uma regra
 * compilada (replay zero-token: "para esta classe de task, use este agente").
 */
function perfToObservation(r: PerfRecord): DecisionObservation {
  const context = { domain: 'agent-routing', phase: 'BUILD', role: r.agentId, input: 'route-task' }
  return { key: decisionKey(context), context, decision: { agentId: r.agentId }, success: r.acPassed, ts: r.ts }
}

/**
 * Roda o Learning Compiler (JIT) sobre os perf_records persistidos: compila
 * decisões de roteamento de agente bem-sucedidas e repetidas em regras
 * determinísticas no {@link DecisionTableStore}. Retorna o sumário da compilação.
 */
export function actionCompile(
  learning: LearningStore,
  decisionStore: DecisionTableStore,
  opts?: CompileOptions,
): CompileResult {
  const observations = learning.readAll().map(perfToObservation)
  return compileDecisions(observations, decisionStore, opts)
}

/** actionExplain —  */
export function actionExplain(
  store: LearningStore,
  strategy?: RoutingStrategy,
): RouteExplanation & { strategy: RoutingStrategy | 'manual' } {
  const records = store.readAll()
  const decision = decideRoute({ strategy, records })
  const baseline = explainRouting(records)
  return {
    ...baseline,
    strategy: decision.strategy,
  }
}

export interface ExportPayload {
  schemaVersion: 1
  exportedAt: string
  records: PerfRecord[]
}

/** actionExport —  */
export function actionExport(store: LearningStore): ExportPayload {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    records: store.readAll(),
  }
}

export interface ImportResult {
  imported: number
  trimmed: number
}

/**
 * Atomic import: validate every record before touching the store, then
 * replace in one call. The store adapter must implement replaceAll() in a
 * single transaction; this module guarantees no partial state.
 */
export function actionImport(
  store: LearningStore,
  payload: ExportPayload,
  options: { maxPerAgent?: number } = {},
): ImportResult {
  if (payload.schemaVersion !== 1) {
    throw new InvalidArgumentError(`learning:import — unsupported schemaVersion ${payload.schemaVersion}`)
  }
  if (!Array.isArray(payload.records)) {
    throw new InvalidArgumentError('learning:import — records must be an array')
  }
  // Pre-validate so a bad record doesn't half-fill the store.
  for (const rVar of payload.records) {
    if (!rVar.agentId || !rVar.nodeId) {
      throw new InvalidArgumentError('learning:import — every record requires agentId and nodeId')
    }
    if (!Number.isFinite(rVar.cycleTimeMs)) {
      throw new InvalidArgumentError('learning:import — cycleTimeMs must be finite')
    }
  }
  const trimmed =
    options.maxPerAgent !== undefined ? trimToRecent(payload.records, options.maxPerAgent) : payload.records
  store.replaceAll(trimmed)
  return {
    imported: trimmed.length,
    trimmed: payload.records.length - trimmed.length,
  }
}

/** In-memory adapter useful for testing + advisory uses. */
export function createMemoryStore(initial: PerfRecord[] = []): LearningStore {
  let records = [...initial]
  return {
    readAll: () => [...records],
    appendRecord: (r) => {
      records = [...records, r]
    },
    replaceAll: (next) => {
      records = [...next]
    },
  }
}
