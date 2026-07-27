/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Knowledge Feedback — applies user/AI feedback to adjust quality scores.
 *
 * Actions:
 * - helpful: +0.05 quality (cap 1.0)
 * - unhelpful: -0.1 quality (floor 0.1)
 * - outdated: set staleness_days = 999
 */

import type Database from 'better-sqlite3'
import { recordUsage } from './knowledge-quality.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'rag', source: 'knowledge-feedback.ts' })

const HELPFUL_BOOST = 0.05
const UNHELPFUL_PENALTY = 0.1
const QUALITY_MAX = 1.0
const QUALITY_MIN = 0.1

/**
 * Apply feedback to a knowledge document.
 * Records usage and adjusts quality_score accordingly.
 */
export function applyFeedback(
  db: Database.Database,
  docId: string,
  query: string,
  action: 'helpful' | 'unhelpful' | 'outdated',
  context?: Record<string, unknown>,
): void {
  // Record the usage event
  recordUsage(db, docId, query, action, context)

  // Get current quality score
  const row = db.prepare('SELECT quality_score FROM knowledge_documents WHERE id = ?').get(docId) as
    { quality_score: number } | undefined

  if (!row) {
    log.warn('Feedback for unknown doc', { docId, action })
    return
  }

  let newScore = row.quality_score

  switch (action) {
    case 'helpful':
      newScore = Math.min(QUALITY_MAX, newScore + HELPFUL_BOOST)
      break
    case 'unhelpful':
      newScore = Math.max(QUALITY_MIN, newScore - UNHELPFUL_PENALTY)
      break
    case 'outdated':
      db.prepare('UPDATE knowledge_documents SET staleness_days = 999 WHERE id = ?').run(docId)
      newScore = Math.max(QUALITY_MIN, newScore - UNHELPFUL_PENALTY)
      break
  }

  db.prepare('UPDATE knowledge_documents SET quality_score = ? WHERE id = ?').run(newScore, docId)

  log.info('Feedback applied', { docId, action, oldScore: row.quality_score, newScore })
}
