/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Success-pattern tracker — strategy-based experiential memory.
 *
 * Mirror of `IssuePatternTracker` for the success side. When ≥3 grade-A
 * finishes share a pattern key (sorted tag set, or parent epic id),
 * recordSuccess returns `shouldEmit: true` and supplies the contributing
 * nodeIds + their rationales so the caller can write a strategy_<key>_<date>.md
 * memory. Closes the survey's noted asymmetry (Hu et al. 2026 §4.2.2 +
 * §5.1.2): mcp-graph already auto-suggests rules from repeated failures
 * (IssuePatternTracker), but had no analog for repeated successes.
 */

import type Database from 'better-sqlite3'
import { generateId } from '../utils/id.js'
import { now } from '../utils/time.js'
import { createLogger } from '../utils/logger.js'
import type { GraphNode } from '../graph/graph-types.js'

const log = createLogger({ layer: 'core', source: 'success-pattern-tracker.ts' })

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS success_patterns (
    id TEXT PRIMARY KEY,
    pattern_key TEXT NOT NULL UNIQUE,
    count INTEGER NOT NULL DEFAULT 0,
    contributing_node_ids TEXT NOT NULL,
    contributing_rationales TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    memory_written INTEGER NOT NULL DEFAULT 0
  )
`

/**
 * Map a graph node to the pattern key that groups it with siblings.
 * Tag set wins (sorted, joined by ","); falls back to the parent epic id.
 * Returns null when neither exists — that node has nothing to pattern over.
 */
export function derivePatternKey(node: Pick<GraphNode, 'tags' | 'parentId'>): string | null {
  const tags = (node.tags ?? []).filter((t) => t && t.length > 0)
  if (tags.length > 0) {
    return `tags:${[...tags].sort().join(',')}`
  }
  if (node.parentId) {
    return `epic:${node.parentId}`
  }
  return null
}

export interface RecordSuccessResult {
  shouldEmit: boolean
  alreadyEmitted: boolean
  patternKey: string | null
  count: number
  contributingNodeIds: string[]
  contributingRationales: string[]
}

const EMPTY_RESULT: RecordSuccessResult = {
  shouldEmit: false,
  alreadyEmitted: false,
  patternKey: null,
  count: 0,
  contributingNodeIds: [],
  contributingRationales: [],
}

export class SuccessPatternTracker {
  private db: Database.Database
  private threshold: number

  constructor(db: Database.Database, threshold: number = 3) {
    this.db = db
    this.threshold = threshold
    this.db.exec(CREATE_TABLE_SQL)
  }

  /**
   * Record a grade-A success. Returns shouldEmit=true exactly once: when the
   * count for this pattern key first reaches the threshold. Subsequent calls
   * for the same key return alreadyEmitted=true.
   */
  recordSuccess(patternKey: string | null, nodeId: string, rationale: string): RecordSuccessResult {
    if (!patternKey) {
      return { ...EMPTY_RESULT }
    }

    const ts = now()
    const existing = this.db
      .prepare(
        'SELECT id, count, contributing_node_ids, contributing_rationales, memory_written FROM success_patterns WHERE pattern_key = ?',
      )
      .get(patternKey) as
      | {
          id: string
          count: number
          contributing_node_ids: string
          contributing_rationales: string
          memory_written: number
        }
      | undefined

    if (!existing) {
      const id = generateId('spt')
      this.db
        .prepare(
          'INSERT INTO success_patterns (id, pattern_key, count, contributing_node_ids, contributing_rationales, first_seen, last_seen, memory_written) VALUES (?, ?, 1, ?, ?, ?, ?, 0)',
        )
        .run(id, patternKey, JSON.stringify([nodeId]), JSON.stringify([rationale]), ts, ts)
      log.debug('success-pattern:recorded:new', { patternKey, nodeId })
      return {
        shouldEmit: false,
        alreadyEmitted: false,
        patternKey,
        count: 1,
        contributingNodeIds: [nodeId],
        contributingRationales: [rationale],
      }
    }

    const ids = JSON.parse(existing.contributing_node_ids) as string[]
    const rats = JSON.parse(existing.contributing_rationales) as string[]
    if (ids.includes(nodeId)) {
      // Idempotent: replaying the same (key, node) is a no-op.
      return {
        shouldEmit: false,
        alreadyEmitted: existing.memory_written === 1,
        patternKey,
        count: existing.count,
        contributingNodeIds: ids,
        contributingRationales: rats,
      }
    }

    const newCount = existing.count + 1
    ids.push(nodeId)
    rats.push(rationale)

    this.db
      .prepare(
        'UPDATE success_patterns SET count = ?, contributing_node_ids = ?, contributing_rationales = ?, last_seen = ? WHERE id = ?',
      )
      .run(newCount, JSON.stringify(ids), JSON.stringify(rats), ts, existing.id)

    if (existing.memory_written === 1) {
      return {
        shouldEmit: false,
        alreadyEmitted: true,
        patternKey,
        count: newCount,
        contributingNodeIds: ids,
        contributingRationales: rats,
      }
    }

    if (newCount >= this.threshold) {
      this.db.prepare('UPDATE success_patterns SET memory_written = 1 WHERE id = ?').run(existing.id)
      log.info('success-pattern:emit', { patternKey, count: newCount, nodes: ids })
      return {
        shouldEmit: true,
        alreadyEmitted: false,
        patternKey,
        count: newCount,
        contributingNodeIds: ids,
        contributingRationales: rats,
      }
    }

    return {
      shouldEmit: false,
      alreadyEmitted: false,
      patternKey,
      count: newCount,
      contributingNodeIds: ids,
      contributingRationales: rats,
    }
  }
}

/**
 * Build the strategy memory payload from a successful pattern emit.
 * Caller is responsible for invoking writeMemory(cwd, name, content).
 */
export function buildStrategyMemory(input: {
  patternKey: string
  nodeIds: readonly string[]
  rationales: readonly string[]
}): { name: string; content: string } {
  const { patternKey, nodeIds, rationales } = input
  const date = new Date().toISOString().slice(0, 10)
  // Sanitize the key for filename (drop colons, commas).
  const slug = patternKey
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '')
  const name = `strategy_${slug || 'untagged'}_${date}`

  const content = [
    '---',
    `name: ${name}`,
    `description: Strategy memory distilled from ${nodeIds.length} grade-A successes sharing pattern key "${patternKey}". Hu et al. 2026 §4.2.2.`,
    `type: feedback`,
    '---',
    '',
    `# Strategy: ${patternKey}`,
    '',
    `**Distilled at:** ${date}`,
    `**Pattern key:** \`${patternKey}\``,
    `**Sample size:** ${nodeIds.length} grade-A finishes`,
    '',
    '## Contributing nodes',
    '',
    ...nodeIds.map((id, i) => [`### \`${id}\``, '', rationales[i] ?? '_(no rationale recorded)_', ''].join('\n')),
    '## How to apply',
    '',
    `Future tasks matching pattern key \`${patternKey}\` should retrieve this memory via RAG. The 3 rationales above are the canonical record of what worked — replay the approach instead of rediscovering it.`,
    '',
  ].join('\n')

  return { name, content }
}
