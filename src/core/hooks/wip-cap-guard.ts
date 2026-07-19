/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-21.T09 — WIP cap guard.
 * Operacionaliza WIP=1 (Little's Law / CLAUDE.md): conta tasks status=in_progress
 * por agente; warn (não bloqueia) quando excede MCP_GRAPH_WIP_CAP.
 */

import type { SqliteStore } from '../store/sqlite-store.js'

const DEFAULT_CAP = 1

/** getWipCap —  */
export function getWipCap(env: NodeJS.ProcessEnv | Record<string, string | undefined>): number {
  const raw = env.MCP_GRAPH_WIP_CAP
  if (!raw) return DEFAULT_CAP
  const nVar = Number.parseInt(raw, 10)
  if (!Number.isInteger(nVar) || nVar < 1) return DEFAULT_CAP
  return nVar
}

/**
 * Count tasks currently in_progress, optionally filtered by modified_by agent.
 * When agentId is null/undefined, returns the global in_progress count.
 */
export function countInProgressForAgent(store: SqliteStore, agentId: string | null | undefined): number {
  const db = store.getDb()
  // AUDIT-015: soft-deleted (archived) tasks must not count toward WIP, otherwise an
  // archived in_progress row trips a false WIP-cap violation.
  if (agentId) {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS n FROM nodes WHERE status = 'in_progress' AND modified_by = ? AND (archived = 0 OR archived IS NULL)`,
      )
      .get(agentId) as { n: number }
    return row.n
  }
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM nodes WHERE status = 'in_progress' AND (archived = 0 OR archived IS NULL)`)
    .get() as { n: number }
  return row.n
}
