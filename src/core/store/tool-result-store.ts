/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Tool Result Store — persists MCP tool outputs for audit, replay, and recovery.
 * SHA-256 content hashing for dedup, 100KB truncation for large results.
 * Inspired by hermes-agent tool result persistence pattern.
 */

import type Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { generateId } from '../utils/id.js'
import { now } from '../utils/time.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'tool-result-store.ts' })

const MAX_RESULT_BYTES = 102_400 // 100KB

export interface ToolResultEntry {
  id: string
  projectId: string
  traceId: string | null
  toolName: string
  toolArgs: string
  result: string
  resultHash: string
  sizeBytes: number
  truncated: boolean
  createdAt: string
}

interface ToolResultRow {
  id: string
  project_id: string
  trace_id: string | null
  tool_name: string
  tool_args: string
  result: string
  result_hash: string
  size_bytes: number
  truncated: number
  created_at: string
}

function rowToEntry(row: ToolResultRow): ToolResultEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    traceId: row.trace_id,
    toolName: row.tool_name,
    toolArgs: row.tool_args,
    result: row.result,
    resultHash: row.result_hash,
    sizeBytes: row.size_bytes,
    truncated: row.truncated === 1,
    createdAt: row.created_at,
  }
}

export class ToolResultStore {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  record(
    projectId: string,
    traceId: string | null,
    toolName: string,
    toolArgs: Record<string, unknown>,
    result: unknown,
  ): string {
    const id = generateId('toolres')
    const argsJson = JSON.stringify(toolArgs)
    let resultJson = JSON.stringify(result)
    const originalSize = Buffer.byteLength(resultJson, 'utf-8')
    let truncated = false

    if (originalSize > MAX_RESULT_BYTES) {
      resultJson = resultJson.slice(0, MAX_RESULT_BYTES)
      truncated = true
      log.debug('tool-result-store:truncated', { toolName, originalSize, truncatedTo: MAX_RESULT_BYTES })
    }

    const resultHash = createHash('sha256').update(resultJson).digest('hex').slice(0, 16)

    this.db
      .prepare(
        `INSERT INTO tool_results (id, project_id, trace_id, tool_name, tool_args, result, result_hash, size_bytes, truncated, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, projectId, traceId, toolName, argsJson, resultJson, resultHash, originalSize, truncated ? 1 : 0, now())

    log.debug('tool-result-store:recorded', { toolName, resultHash, sizeBytes: originalSize, truncated })
    return id
  }

  getByTrace(traceId: string): ToolResultEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM tool_results WHERE trace_id = ? ORDER BY created_at ASC')
      .all(traceId) as ToolResultRow[]
    return rows.map(rowToEntry)
  }

  getByToolName(projectId: string, toolName: string, limit: number = 50): ToolResultEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM tool_results WHERE project_id = ? AND tool_name = ? ORDER BY created_at DESC LIMIT ?')
      .all(projectId, toolName, limit) as ToolResultRow[]
    return rows.map(rowToEntry)
  }
}
