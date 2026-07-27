/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * SqliteTrajectoryStore — persistência real do ReasoningBank sobre a tabela
 * `reasoning_trajectories` (migration v068, até então dormant/sem leitor).
 * Implementa o `TrajectoryStore` (insert/all/count) para que a lógica pura
 * existente em reasoning-bank.ts (storeTrajectory, recallSimilar,
 * recallSuccessful) funcione inalterada, agora sobrevivendo entre
 * invocações do processo.
 */
import type Database from 'better-sqlite3'
import type { SqliteStore } from '../store/sqlite-store.js'
import type { Trajectory, TrajectoryStore } from './reasoning-bank.js'

/** Namespace fixo em task_kind — isola linhas do ReasoningBank de outros futuros usos da tabela. */
const TASK_KIND = 'reasoning-bank'

interface TrajectoryRow {
  id: string
  node_id: string | null
  trajectory: string
  outcome_score: number
  last_used_ts: string
}

interface TrajectoryPayload {
  toolSequence: string[]
  notes?: string
}

function rowToTrajectory(row: TrajectoryRow): Trajectory {
  const payload = JSON.parse(row.trajectory) as TrajectoryPayload
  return {
    id: row.id,
    nodeId: row.node_id ?? '',
    toolSequence: payload.toolSequence,
    outcomeScore: row.outcome_score,
    notes: payload.notes,
    ts: Date.parse(row.last_used_ts),
  }
}

/** SQLite-backed {@link TrajectoryStore}, escopado ao projeto aberto (mesmo projectId dos perf_records). */
export class SqliteTrajectoryStore implements TrajectoryStore {
  private readonly db: Database.Database
  private readonly projectId: string
  private readonly agentName: string

  constructor(store: SqliteStore, agentName: string = 'agf-cli') {
    this.db = store.getDb()
    this.projectId = store.getProject()?.id ?? 'default'
    this.agentName = agentName
  }

  insert(t: Trajectory): void {
    const iso = new Date(t.ts).toISOString()
    this.db
      .prepare(
        `INSERT OR REPLACE INTO reasoning_trajectories
         (id, project_id, node_id, agent_name, task_kind, trajectory, outcome_score, samples, last_used_ts, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        t.id,
        this.projectId,
        t.nodeId,
        this.agentName,
        TASK_KIND,
        JSON.stringify({ toolSequence: t.toolSequence, notes: t.notes }),
        t.outcomeScore,
        iso,
        iso,
      )
  }

  all(): Trajectory[] {
    const rows = this.db
      .prepare(
        `SELECT id, node_id, trajectory, outcome_score, last_used_ts
         FROM reasoning_trajectories WHERE project_id = ? AND task_kind = ?
         ORDER BY last_used_ts`,
      )
      .all(this.projectId, TASK_KIND) as TrajectoryRow[]
    return rows.map(rowToTrajectory)
  }

  count(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as c FROM reasoning_trajectories WHERE project_id = ? AND task_kind = ?')
      .get(this.projectId, TASK_KIND) as { c: number }
    return row.c
  }
}
