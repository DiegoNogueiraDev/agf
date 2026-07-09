/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * createApiRouter — mounts the dashboard's REST surface under /api/v1.
 *
 * WHY: the React SPA (src/web/dashboard) consumes a small, stable REST API.
 * This router is the single mount point; each resource is its own thin-wire
 * route file (SRP). Every handler reads the live store / existing snapshot
 * builders — no business logic lives here. To add a resource: write a
 * routes/<name>.ts factory and mount it below.
 *
 * Contract: JSON on success; errors fall through to errorHandler → 500 envelope.
 */

import express, { Router } from 'express'
import type { SqliteStore } from '../core/store/sqlite-store.js'
import { createGraphRouter } from './routes/graph.js'
import { createEdgesRouter } from './routes/edges.js'
import { createStatsRouter } from './routes/stats.js'
import { createEconomyRouter } from './routes/economy.js'
import { createHealthRouter } from './routes/health.js'
import { createEventsSseRouter } from './routes/events-sse.js'
import { createAgentRouter } from './routes/agent.js'
import { errorHandler } from './middleware/error-handler.js'

export interface ApiRouterOptions {
  store: SqliteStore
}

/** Build the /api/v1 router for the given live store. */
export function createApiRouter(options: ApiRouterOptions): Router {
  const { store } = options
  const router = Router()

  router.use(express.json({ limit: '5mb' }))

  router.use('/graph', createGraphRouter(store))
  router.use('/edges', createEdgesRouter(store))
  router.use('/stats', createStatsRouter(store))
  router.use('/economy', createEconomyRouter(store))
  router.use('/health', createHealthRouter(store))
  router.use('/events', createEventsSseRouter())
  router.use('/agent', createAgentRouter(store))

  router.use(errorHandler)

  return router
}
