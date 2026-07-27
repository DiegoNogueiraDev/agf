/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-Calibracao-Estimativas Task 2.4 — Override capture em next.
 *
 * Pure telemetry — writes to next_overrides table.
 * Never touches nodes, edges, or status fields.
 */

import type Database from 'better-sqlite3'
import { generateId } from '../utils/id.js'
import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'planner/next-override-tracker.ts' })

// ── Types ────────────────────────────────────────────────────────────────────

export interface NextOverrideInput {
  projectId: string
  suggestionId: string
  actualId: string
  suggestionPriority?: number
  actualPriority?: number
  suggestionTags?: string[]
  actualTags?: string[]
  timestamp: string
}

export interface OverridePattern {
  pattern: string
  count: number
  hypothesis: string
}

export interface NextPolicyAuditReport {
  status: 'healthy' | 'unhealthy'
  overrides: number
  patterns?: OverridePattern[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_OVERRIDE_THRESHOLD = 5

// ── Write ────────────────────────────────────────────────────────────────────

/** Record an override when start_task was called for a different task than what next() suggested. Telemetry-only. */
export function recordNextOverride(db: Database.Database, input: NextOverrideInput): void {
  db.prepare(
    `INSERT INTO next_overrides
       (id, project_id, suggestion_id, actual_id, suggestion_priority, actual_priority, suggestion_tags, actual_tags, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    generateId('nov'),
    input.projectId,
    input.suggestionId,
    input.actualId,
    input.suggestionPriority ?? null,
    input.actualPriority ?? null,
    input.suggestionTags ? JSON.stringify(input.suggestionTags) : null,
    input.actualTags ? JSON.stringify(input.actualTags) : null,
    input.timestamp,
  )
}

// ── Read ─────────────────────────────────────────────────────────────────────

interface OverrideRow {
  suggestion_id: string
  actual_id: string
  suggestion_priority: number | null
  actual_priority: number | null
  suggestion_tags: string | null
}

/** Analyze override history for a project and surface patterns exceeding the threshold. */
export function analyzeNextPolicyAudit(db: Database.Database, projectId: string): NextPolicyAuditReport {
  let rows: OverrideRow[]
  try {
    rows = db
      .prepare(
        'SELECT suggestion_id, actual_id, suggestion_priority, actual_priority, suggestion_tags FROM next_overrides WHERE project_id = ?',
      )
      .all(projectId) as OverrideRow[]
  } catch {
    return { status: 'healthy', overrides: 0 }
  }

  if (rows.length === 0) {
    return { status: 'healthy', overrides: 0 }
  }

  const patterns: OverridePattern[] = []

  // Priority override: suggestion had high priority (1) but executed was lower priority (≥3)
  const priorityOverrides = rows.filter(
    (r) =>
      r.suggestion_priority != null &&
      r.actual_priority != null &&
      r.suggestion_priority === 1 &&
      r.actual_priority >= 3,
  )

  if (priorityOverrides.length >= PRIORITY_OVERRIDE_THRESHOLD) {
    // Collect the most common tag from the bypassed high-priority suggestions
    const tagCounts: Record<string, number> = {}
    for (const r of priorityOverrides) {
      if (r.suggestion_tags) {
        try {
          const tags = JSON.parse(r.suggestion_tags) as string[]
          for (const tag of tags) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1
        } catch (_e) {
          void _e // malformed suggestion_tags JSON — skip tag aggregation
        }
      }
    }
    const topTag = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    const tagHint = topTag ? ` [${topTag}]` : ''

    patterns.push({
      pattern: 'priority_override',
      count: priorityOverrides.length,
      hypothesis: `priority scoring may underweight${tagHint}`,
    })
  }

  const status = patterns.length > 0 ? 'unhealthy' : 'healthy'
  return { status, overrides: rows.length, patterns: patterns.length > 0 ? patterns : undefined }
}
