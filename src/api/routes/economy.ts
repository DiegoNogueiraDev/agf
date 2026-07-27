/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * economy route — GET /api/v1/economy. Thin wire over buildEconomySnapshot():
 * token/cost totals, cumulative savings rate, and per-lever savings. Reuses the
 * existing pure builder (src/core/web/economy-snapshot.ts), which composes the
 * ledger aggregators — zero new SQL here.
 */

import { Router } from 'express'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { buildEconomySnapshot } from '../../core/web/economy-snapshot.js'

/** Build the /economy router bound to a live store. */
export function createEconomyRouter(store: SqliteStore): Router {
  const router = Router()

  router.get('/', (_req, res, next) => {
    try {
      res.json(buildEconomySnapshot(store))
    } catch (err) {
      next(err)
    }
  })

  return router
}
