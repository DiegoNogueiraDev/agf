/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * edges route — POST /api/v1/edges. Creates a relationship between two existing
 * nodes from the Graph tab's edge-create dialog. Mirrors `agf edge add`: both
 * endpoints validate the nodes exist, generate an id, and call store.insertEdge
 * — the store stays the single source of truth.
 *
 * Contract: body { from, to, relationType, reason? } → 201 { id, ... } |
 *           404 if either node is missing | 400 on a malformed body.
 */

import { Router } from 'express'
import { z } from 'zod'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import type { RelationType } from '../../core/graph/graph-types.js'
import { generateId } from '../../core/utils/id.js'

const CreateEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  relationType: z.string().min(1),
  reason: z.string().optional(),
})

/** Build the /edges router bound to a live store. */
export function createEdgesRouter(store: SqliteStore): Router {
  const router = Router()

  router.post('/', (req, res, next) => {
    try {
      const parsed = CreateEdgeSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join('; ') })
        return
      }
      const { from, to, relationType, reason } = parsed.data
      if (!store.getNodeById(from)) {
        res.status(404).json({ error: `Source node not found: ${from}` })
        return
      }
      if (!store.getNodeById(to)) {
        res.status(404).json({ error: `Target node not found: ${to}` })
        return
      }
      const id = generateId('edge')
      const createdAt = new Date().toISOString()
      store.insertEdge({ id, from, to, relationType: relationType as RelationType, reason, createdAt })
      res.status(201).json({ id, from, to, relationType, reason, createdAt })
    } catch (err) {
      next(err)
    }
  })

  return router
}
