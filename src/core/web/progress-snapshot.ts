/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_56f05fb502ce — Snapshot serializável do progresso para a web mínima.
 * Reusa loadDashboardModel; guarda store sem projeto (retorna snapshot vazio).
 */
import { loadDashboardModel, type TaskLine, type TokenSummaryLine } from './model.js'
import type { SqliteStore } from '../store/sqlite-store.js'
import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'web/progress-snapshot.ts' })

export interface ProgressSnapshot {
  project: string
  phase: string
  modelLabel: string
  wip: number
  totalTasks: number
  tasks: TaskLine[]
  tokens: TokenSummaryLine
}

const EMPTY: ProgressSnapshot = {
  project: '—',
  phase: '—',
  modelLabel: '—',
  wip: 0,
  totalTasks: 0,
  tasks: [],
  tokens: { total: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, calls: 0 },
}

/** Estado atual do grafo + tokens, pronto para JSON. */
export function buildProgressSnapshot(store: SqliteStore): ProgressSnapshot {
  if (!store.getProject()) return { ...EMPTY, tasks: [] }
  const m = loadDashboardModel(store)
  return {
    project: m.projectName,
    phase: String(m.phase),
    modelLabel: m.modelLabel,
    wip: m.wip,
    totalTasks: m.totalTasks,
    tasks: m.tasks,
    tokens: m.tokens,
  }
}
