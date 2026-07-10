/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-21.T02 — Doc-sync guard.
 * Detecta drift PRD↔código: para cada arquivo doc-related (CLAUDE.md,
 * .claude/rules/, docs/), compara hash atual com baseline armazenado.
 * Drift = mesmo hash AND node.updatedAt > 7d desde última atualização do doc.
 * Caller (hook task:post-complete) loga advisory.
 */

import { createHash } from 'node:crypto'

export const DOC_DRIFT_AGE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

export interface DocBaseline {
  path: string
  hash: string
  recordedAt: number
}

export interface DocCheckInput {
  path: string
  currentContent: string
  baseline?: DocBaseline
  /** Most recent node.updated_at among nodes that reference this doc. */
  latestNodeUpdateMs: number
  /** Timestamp considered "now" (default Date.now()). */
  nowMs?: number
}

export interface DocCheckResult {
  drift: boolean
  reason: 'no_baseline' | 'content_changed' | 'stale_doc' | 'fresh'
  ageDays: number
}

/** isDocSyncDisabled —  */
export function isDocSyncDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MCP_GRAPH_DOC_SYNC === 'off'
}

/** hashDocContent —  */
export function hashDocContent(content: string): string {
  return createHash('sha1').update(content).digest('hex').slice(0, 16)
}

/** detectDocDrift —  */
export function detectDocDrift(input: DocCheckInput): DocCheckResult {
  const now = input.nowMs ?? Date.now()
  const currentHash = hashDocContent(input.currentContent)

  if (!input.baseline) {
    return { drift: false, reason: 'no_baseline', ageDays: 0 }
  }

  const docAgeDays = (now - input.baseline.recordedAt) / DAY_MS

  if (input.baseline.hash !== currentHash) {
    // Doc changed since baseline → caller should refresh baseline, not warn.
    return { drift: false, reason: 'content_changed', ageDays: docAgeDays }
  }

  // Same hash but node activity since baseline = stale doc.
  const nodeUpdatedAfterBaseline = input.latestNodeUpdateMs > input.baseline.recordedAt
  if (docAgeDays > DOC_DRIFT_AGE_DAYS && nodeUpdatedAfterBaseline) {
    return { drift: true, reason: 'stale_doc', ageDays: docAgeDays }
  }

  return { drift: false, reason: 'fresh', ageDays: docAgeDays }
}
