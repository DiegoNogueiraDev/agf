/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * health route — liveness + readiness for the dashboard server.
 *   GET /api/v1/health/live → always 200 when the process responds.
 *   GET /api/v1/health      → 200 when the store is queryable, 503 otherwise.
 */

import { Router } from 'express'
import type { SqliteStore } from '../../core/store/sqlite-store.js'

/** Build the /health router bound to a live store. */
export function createHealthRouter(store: SqliteStore): Router {
  const router = Router()

  router.get('/live', (_req, res) => {
    res.json({ status: 'ok' })
  })

  router.get('/', (_req, res) => {
    try {
      store.getStats()
      res.json({ status: 'ok' })
    } catch (err) {
      res.status(503).json({ status: 'error', error: (err as Error).message })
    }
  })

  return router
}
