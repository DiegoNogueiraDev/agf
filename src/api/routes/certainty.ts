/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * certainty route — GET /api/v1/certainty/:nodeId (node_3ecf21eea0dc).
 *
 * Thin wire over computeDeliveryCertainty(): the WEB surface reads the exact
 * same verdict the CLI (`agf certainty`) and the done-gate (`--certainty`) read.
 * Zero recomputation here and none in the front — one composer, three surfaces,
 * so the three can never disagree about whether something is done.
 *
 * A node that does not exist returns 404 (not an empty verdict): the tab must
 * degrade with a readable message, never render a fabricated PROVEN/UNKNOWN.
 */

import { existsSync } from 'node:fs'
import { Router } from 'express'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { computeDeliveryCertainty } from '../../core/certainty/delivery-certainty.js'

/** Build the /certainty router bound to a live store. */
export function createCertaintyRouter(store: SqliteStore): Router {
  const router = Router()

  router.get('/:nodeId', (req, res, next) => {
    try {
      const { nodeId } = req.params
      if (!store.getNodeById(nodeId)) {
        res.status(404).json({ error: `Node ${nodeId} not found` })
        return
      }
      res.json(
        computeDeliveryCertainty(store.toGraphDocument(), nodeId, {
          fileExists: (p: string) => existsSync(p),
        }),
      )
    } catch (err) {
      next(err)
    }
  })

  return router
}
