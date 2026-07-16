/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * colony route — GET /api/v1/colony. Thin wire (espelho de graph.ts) que compõe
 * leitores já existentes, SEM SQL novo: listPheromoneTrails (estado cru das
 * trilhas), normalizedEntropy + classifyEntropy (saúde da busca MMAS) e
 * buildColonyHealthSnapshot (visão operacional). Shape é o contract
 * node_c8b85a2b9c29: JSON direto, 200 sempre — colônia vazia devolve
 * trails:[] e band 'unknown', nunca 500.
 */

import { Router } from 'express'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { listPheromoneTrails, normalizedEntropy, classifyEntropy } from '../../core/economy/mmas-pheromone.js'
import { buildColonyHealthSnapshot } from '../../core/web/colony-health-snapshot.js'

/** Build the /colony router bound to a live store. */
export function createColonyRouter(store: SqliteStore): Router {
  const router = Router()

  router.get('/', (_req, res, next) => {
    try {
      const db = store.getDb()
      const projectId = store.getProject()?.id ?? ''
      const trails = listPheromoneTrails(db, projectId)
      const hNorm = normalizedEntropy(trails.map((t) => t.amount))
      // Colônia sem trilhas não é 'stagnant' — é ausência de sinal ('unknown').
      const band = trails.length > 0 ? classifyEntropy(hNorm) : 'unknown'
      const health = buildColonyHealthSnapshot(store.getStats(), { db, projectId })
      res.json({ trails, entropy: { hNorm, band }, health })
    } catch (err) {
      next(err)
    }
  })

  return router
}
