/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * agent route — GET /api/v1/agent/learnings plus live agent presence
 * (register/heartbeat/active/unregister), a thin wire over the in-memory
 * AgentRegistry (core/store/agent-registry.ts). One AgentRegistry instance
 * lives for the lifetime of the dashboard server process, scoped to the
 * store passed at router creation.
 */

import { Router } from 'express'
import path from 'node:path'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { aggregateAgentLearnings } from '../../core/insights/agent-learnings.js'
import { AgentRegistry } from '../../core/store/agent-registry.js'

/** Build the /agent router bound to a live store. */
export function createAgentRouter(store: SqliteStore): Router {
  const router = Router()
  const registry = new AgentRegistry(store.getDb())

  router.get('/learnings', (req, res, next) => {
    try {
      const skillsDir = path.join(process.cwd(), 'workflow-graph', 'domain-skills')
      const context = typeof req.query.context === 'string' ? req.query.context : undefined
      res.json(aggregateAgentLearnings(store.getDb(), skillsDir, context))
    } catch (err) {
      next(err)
    }
  })

  router.get('/active', (_req, res) => {
    res.json({ agents: registry.listAgents() })
  })

  router.post('/register', (req, res) => {
    const { agentId, capabilities } = (req.body ?? {}) as { agentId?: unknown; capabilities?: unknown }
    if (typeof agentId !== 'string' || agentId.length === 0) {
      res.status(400).json({ error: 'agentId is required' })
      return
    }
    const caps = Array.isArray(capabilities) ? capabilities.filter((c): c is string => typeof c === 'string') : []
    registry.registerAgent(agentId, caps)
    res.status(201).json({ registered: agentId })
  })

  router.post('/heartbeat', (req, res) => {
    const { agentId } = (req.body ?? {}) as { agentId?: unknown }
    if (typeof agentId !== 'string' || agentId.length === 0) {
      res.status(400).json({ error: 'agentId is required' })
      return
    }
    registry.heartbeat(agentId)
    res.json({ ok: true })
  })

  router.delete('/:agentId', (req, res) => {
    registry.unregisterAgent(req.params.agentId)
    res.status(204).end()
  })

  return router
}
