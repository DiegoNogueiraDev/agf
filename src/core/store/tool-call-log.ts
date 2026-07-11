/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Tool Call Log — tracks MCP tool calls per node for prerequisite enforcement.
 * Follows ToolTokenStore pattern: receives Database.Database in constructor.
 */

import type Database from 'better-sqlite3'
import { now } from '../utils/time.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'tool-call-log.ts' })

export interface ToolCallEntry {
  id: number
  projectId: string
  nodeId: string | null
  toolName: string
  toolArgs: string | null
  calledAt: string
}

/** Per-mode usage stats for a tool — V11 Maestro mode-telemetry. */
export interface ModeCallCount {
  mode: string
  callCount: number
  /** ISO timestamp of the most recent call, or null when callCount=0 (orphan candidate). */
  lastCalledAt: string | null
}

interface ToolCallRow {
  id: number
  project_id: string
  node_id: string | null
  tool_name: string
  tool_args: string | null
  called_at: string
}

function rowToEntry(row: ToolCallRow): ToolCallEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    nodeId: row.node_id,
    toolName: row.tool_name,
    toolArgs: row.tool_args,
    calledAt: row.called_at,
  }
}

/** Escape SQL LIKE wildcards (Bug #053). */
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (c) => `\\${c}`)
}

export class ToolCallLog {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /** Record a successful tool call. */
  record(projectId: string, nodeId: string | null, toolName: string, toolArgs?: string): void {
    this.db
      .prepare(
        `INSERT INTO tool_call_log (project_id, node_id, tool_name, tool_args, called_at)
       VALUES (?, ?, ?, ?, ?)`,
      )
      .run(projectId, nodeId, toolName, toolArgs ?? null, now())
    log.debug('tool-call-log: recorded', { toolName, nodeId })
  }

  /** Check if a tool was called for a node (or project-wide when nodeId is null). */
  hasBeenCalled(projectId: string, nodeId: string | null, toolName: string, toolArgs?: string): boolean {
    if (nodeId === null) {
      if (toolArgs) {
        const row = this.db
          .prepare(
            `SELECT 1 FROM tool_call_log
           WHERE project_id = ? AND node_id IS NULL AND tool_name = ? AND tool_args LIKE ? ESCAPE '\\'
           LIMIT 1`,
          )
          .get(projectId, toolName, `%${escapeLike(toolArgs)}%`)
        return row !== undefined
      }
      const row = this.db
        .prepare(
          `SELECT 1 FROM tool_call_log
         WHERE project_id = ? AND node_id IS NULL AND tool_name = ?
         LIMIT 1`,
        )
        .get(projectId, toolName)
      return row !== undefined
    }

    if (toolArgs) {
      const row = this.db
        .prepare(
          `SELECT 1 FROM tool_call_log
         WHERE project_id = ? AND node_id = ? AND tool_name = ? AND tool_args LIKE ? ESCAPE '\\'
         LIMIT 1`,
        )
        .get(projectId, nodeId, toolName, `%${escapeLike(toolArgs)}%`)
      return row !== undefined
    }

    const row = this.db
      .prepare(
        `SELECT 1 FROM tool_call_log
       WHERE project_id = ? AND node_id = ? AND tool_name = ?
       LIMIT 1`,
      )
      .get(projectId, nodeId, toolName)
    return row !== undefined
  }

  /** Get all tool calls for a specific node. */
  getCallsForNode(projectId: string, nodeId: string): ToolCallEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM tool_call_log
       WHERE project_id = ? AND node_id = ?
       ORDER BY called_at ASC`,
      )
      .all(projectId, nodeId) as ToolCallRow[]
    return rows.map(rowToEntry)
  }

  /** Get recent tool calls for a project across all nodes, most recent first. */
  getAllCalls(projectId: string, limit = 100): ToolCallEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM tool_call_log
       WHERE project_id = ?
       ORDER BY called_at DESC, id DESC
       LIMIT ?`,
      )
      .all(projectId, limit) as ToolCallRow[]
    return rows.map(rowToEntry)
  }

  /** Clear all logs for a project. */
  clearProject(projectId: string): void {
    this.db.prepare('DELETE FROM tool_call_log WHERE project_id = ?').run(projectId)
    log.debug('tool-call-log: cleared project', { projectId })
  }

  /**
   * V11 Maestro mode-telemetry — per-mode call counts for a single tool.
   *
   * Reads tool_args (JSON string) and aggregates by `$.mode`. Backs the
   * orphan-mode deprecation gate: a mode with callCount=0 over 30 days is a
   * candidate for removal from analyze.ts. Optionally surfaces zero-count
   * orphan candidates by passing `candidates`.
   *
   * @param projectId   — scope to a single project
   * @param toolName    — typically "analyze"
   * @param sinceDays   — optional window (default: all time)
   * @param candidates  — optional explicit list of modes to include even if
   *                      callCount=0 (for orphan detection)
   */
  getModeCallCounts(
    projectId: string,
    toolName: string,
    sinceDays?: number,
    candidates?: ReadonlyArray<string>,
  ): ModeCallCount[] {
    const sinceClause =
      sinceDays !== undefined ? `AND called_at >= datetime('now', '-${Math.max(0, Math.floor(sinceDays))} days')` : ''

    const rows = this.db
      .prepare(
        `SELECT
         json_extract(tool_args, '$.mode') AS mode,
         COUNT(*) AS call_count,
         MAX(called_at) AS last_called_at
       FROM tool_call_log
       WHERE project_id = ?
         AND tool_name = ?
         AND json_extract(tool_args, '$.mode') IS NOT NULL
         ${sinceClause}
       GROUP BY mode
       ORDER BY call_count DESC`,
      )
      .all(projectId, toolName) as Array<{
      mode: string
      call_count: number
      last_called_at: string
    }>

    const observed: ModeCallCount[] = rows.map((r) => ({
      mode: r.mode,
      callCount: r.call_count,
      lastCalledAt: r.last_called_at,
    }))

    if (!candidates || candidates.length === 0) {
      return observed
    }

    // Surface zero-count orphans for explicit candidates.
    const seen = new Set(observed.map((o) => o.mode))
    for (const cand of candidates) {
      if (!seen.has(cand)) {
        observed.push({ mode: cand, callCount: 0, lastCalledAt: null })
      }
    }
    return observed
  }
}
