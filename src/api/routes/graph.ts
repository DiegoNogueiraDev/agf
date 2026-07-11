/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * graph route — GET /api/v1/graph. Thin wire over store.toGraphDocument():
 * returns the full { nodes, edges } the dashboard's @xyflow graph + node-detail
 * panel render. No new SQL — the store is the single source of truth. The web
 * client (use-graph-data) sanitizes the payload on receipt, so this stays a
 * straight projection.
 */

import { Router } from 'express'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { safeParseInt } from '../../core/utils/parse-query.js'

/** Build the /graph router bound to a live store. */
export function createGraphRouter(store: SqliteStore): Router {
  const router = Router()

  router.get('/', (req, res, next) => {
    try {
      const doc = store.toGraphDocument()
      const { value: limit } = safeParseInt(req.query.limit as string | undefined, {
        min: 1,
        defaultValue: doc.nodes.length,
      })
      res.json({ nodes: doc.nodes.slice(0, limit), edges: doc.edges })
    } catch (err) {
      next(err)
    }
  })

  return router
}
