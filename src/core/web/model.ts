/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Modelo de domínio — tipos e funções puras do modelo de visão da TUI/web.
 * Separado de src/tui/model.ts para respeitar layer boundary: core nao importa tui.
 */
import { detectPhase, type CanonicalPhase } from '../lifecycle/phase.js'

export type { CanonicalPhase }
import { summarizeLedger } from '../observability/llm-call-ledger.js'
import { routeModel, type RouterConfig } from '../model-hub/tier-router.js'
import type { SqliteStore } from '../store/sqlite-store.js'
import type { NodeStatus } from '../graph/graph-types.js'
import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'web/model.ts' })

export interface TaskLine {
  id: string
  title: string
  status: NodeStatus
}

export interface TokenSummaryLine {
  total: number
  tokensIn: number
  tokensOut: number
  costUsd: number
  calls: number
}

export interface DashboardModel {
  projectName: string
  phase: CanonicalPhase | '—'
  modelLabel: string
  /** Tasks in_progress (WIP). */
  wip: number
  /** Tasks ativas a exibir (in_progress/ready/blocked). */
  tasks: TaskLine[]
  /** Total de nós no grafo. */
  totalTasks: number
  tokens: TokenSummaryLine
}

export interface DashboardInput {
  projectName: string
  stats: { totalNodes: number; byStatus: Record<string, number> }
  tasks: TaskLine[]
  tokens: TokenSummaryLine
  modelLabel: string
}

/** Carrega o modelo de visão do store (costura fina). */
export function loadDashboardModel(store: SqliteStore): DashboardModel {
  const stats = store.getStats()
  const active = store.queryNodes({ status: ['in_progress', 'ready', 'blocked'], limit: 12 }).nodes
  const tasks: TaskLine[] = active.map((n) => ({ id: n.id, title: n.title, status: n.status }))

  const setting = store.getProjectSetting('model') ?? 'auto'
  const config: RouterConfig = setting === 'auto' ? { mode: 'auto' } : { mode: 'pinned', modelId: setting }
  const modelLabel = setting === 'auto' ? 'auto' : routeModel(config, 'implement')

  const summary = summarizeLedger(store.getDb())
  const tokens: TokenSummaryLine = {
    total: summary.totals.total,
    tokensIn: summary.totals.tokensIn,
    tokensOut: summary.totals.tokensOut,
    costUsd: summary.totals.costUsd,
    calls: summary.totals.calls,
  }

  return buildDashboardModel({
    projectName: store.getProject()?.name ?? '(sem projeto)',
    stats,
    tasks,
    tokens,
    modelLabel,
  })
}

/** Monta o modelo de visão a partir de dados já carregados (puro). */
export function buildDashboardModel(input: DashboardInput): DashboardModel {
  const { stats } = input
  const phase: CanonicalPhase | '—' =
    stats.totalNodes === 0
      ? '—'
      : detectPhase({
          totalNodes: stats.totalNodes,
          backlog: stats.byStatus.backlog ?? 0,
          inProgress: stats.byStatus.in_progress ?? 0,
          done: stats.byStatus.done ?? 0,
        })
  return {
    projectName: input.projectName,
    phase,
    modelLabel: input.modelLabel,
    wip: stats.byStatus.in_progress ?? 0,
    tasks: input.tasks,
    totalTasks: stats.totalNodes,
    tokens: input.tokens,
  }
}
