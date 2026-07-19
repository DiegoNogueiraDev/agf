/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * SqliteLearningStore — persistência real do learning sobre a tabela
 * `perf_records` (migration v100). Implementa o `LearningStore` (readAll/
 * appendRecord/replaceAll) para que TODA a lógica pura existente (actionStats,
 * actionRoute, actionExplain, actionExport, aggregatePerformance) funcione
 * inalterada, agora sobrevivendo entre invocações do processo.
 */
import type Database from 'better-sqlite3'
import type { SqliteStore } from '../store/sqlite-store.js'
import type { LearningStore } from './learning-actions.js'
import type { PerfRecord } from './performance-tracker.js'
import { createLogger } from '../utils/logger.js'
import { emitMemoryLearningHook } from '../hooks/memory-learning-lifecycle-hooks.js'

const log = createLogger({ layer: 'core', source: 'sqlite-learning-store.ts' })

interface PerfRow {
  id: string
  project_id: string
  agent_id: string
  node_id: string
  harness_delta: number
  ac_passed: number
  cycle_time_ms: number
  ts: number
}

function rowToRecord(row: PerfRow): PerfRecord {
  return {
    agentId: row.agent_id,
    nodeId: row.node_id,
    harnessDelta: row.harness_delta,
    acPassed: row.ac_passed === 1,
    cycleTimeMs: row.cycle_time_ms,
    ts: row.ts,
  }
}

/** Deterministic id (sem Math.random/Date.now no caminho de teste). */
function recordId(projectId: string, r: PerfRecord): string {
  return `perf_${projectId}_${r.nodeId}_${r.ts}_${r.agentId}`
}

/**
 * SQLite-backed {@link LearningStore}. Escritas via better-sqlite3 são
 * síncronas — completam dentro do `await handler(event)`, garantindo flush
 * antes do exit do CLI.
 */
export class SqliteLearningStore implements LearningStore {
  private readonly db: Database.Database
  private readonly projectId: string

  constructor(store: SqliteStore) {
    this.db = store.getDb()
    this.projectId = store.getProject()?.id ?? 'default'
  }

  readAll(): PerfRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM perf_records WHERE project_id = ? ORDER BY ts')
      .all(this.projectId) as PerfRow[]
    return rows.map(rowToRecord)
  }

  appendRecord(record: PerfRecord): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO perf_records
         (id, project_id, agent_id, node_id, harness_delta, ac_passed, cycle_time_ms, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        recordId(this.projectId, record),
        this.projectId,
        record.agentId,
        record.nodeId,
        record.harnessDelta,
        record.acPassed ? 1 : 0,
        record.cycleTimeMs,
        record.ts,
      )
    log.debug('perf_record:persisted', { agentId: record.agentId, nodeId: record.nodeId })
    emitMemoryLearningHook('on_feedback', {
      agentId: record.agentId,
      nodeId: record.nodeId,
      acPassed: record.acPassed,
      harnessDelta: record.harnessDelta,
    })
  }

  replaceAll(records: PerfRecord[]): void {
    const tx = this.db.transaction((recs: PerfRecord[]) => {
      this.db.prepare('DELETE FROM perf_records WHERE project_id = ?').run(this.projectId)
      for (const r of recs) this.appendRecord(r)
    })
    tx(records)
  }
}
