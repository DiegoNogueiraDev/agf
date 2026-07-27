/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * stats route — GET /api/v1/stats. Thin wire over store.getStats(): totalNodes
 * + byStatus + byType, used by the dashboard header (done/total) and useStats.
 * No new SQL.
 */

import { Router } from 'express'
import type { SqliteStore } from '../../core/store/sqlite-store.js'

/** Build the /stats router bound to a live store. */
export function createStatsRouter(store: SqliteStore): Router {
  const router = Router()

  router.get('/', (_req, res, next) => {
    try {
      res.json(store.getStats())
    } catch (err) {
      next(err)
    }
  })

  return router
}
