/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * agent route — GET /api/v1/agent/learnings. Thin wire over
 * aggregateAgentLearnings: domain skills (matched by ?context= hostname) +
 * recent failure signals + policy observations + issue patterns. No new SQL —
 * reuses core/insights/agent-learnings.ts as-is.
 */

import { Router } from 'express'
import path from 'node:path'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { aggregateAgentLearnings } from '../../core/insights/agent-learnings.js'

/** Build the /agent router bound to a live store. */
export function createAgentRouter(store: SqliteStore): Router {
  const router = Router()

  router.get('/learnings', (req, res, next) => {
    try {
      const skillsDir = path.join(process.cwd(), 'workflow-graph', 'domain-skills')
      const context = typeof req.query.context === 'string' ? req.query.context : undefined
      res.json(aggregateAgentLearnings(store.getDb(), skillsDir, context))
    } catch (err) {
      next(err)
    }
  })

  return router
}
