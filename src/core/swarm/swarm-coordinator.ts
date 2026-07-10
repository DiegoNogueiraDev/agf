/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * SwarmCoordinator — durable session lifecycle for multi-agent runs.
 *
 * One row per swarm orchestration in swarm_sessions; the skeleton persists state
 * so a crashed coordinator can be resumed (the LSTM §3 parameter server keeps
 * the authoritative state; workers reattach). Ties together the async primitives
 * (claim-manager, a2a-mailbox, consensus) under one session handle.
 *
 * Ported from graph-flow/core/swarm/swarm-coordinator.ts.
 */

import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { McpGraphError } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'
import { SwarmConfigSchema } from './swarm-types.js'
import type { SwarmConfigInput, Topology, ConsensusKind } from './swarm-types.js'

const log = createLogger({ layer: 'core', source: 'swarm-coordinator' })

export interface SwarmSession {
  id: string
  topology: Topology
  consensus: ConsensusKind
  status: 'pending' | 'active' | 'stopped'
  maxAgents: number
  strategy: string
  createdAt: string
  updatedAt: string
}

interface SessionRow {
  id: string
  topology: string
  consensus: string
  status: string
  max_agents: number
  strategy: string
  created_at: string
  updated_at: string
}

function toSession(row: SessionRow): SwarmSession {
  return {
    id: row.id,
    topology: row.topology as Topology,
    consensus: row.consensus as ConsensusKind,
    status: row.status as SwarmSession['status'],
    maxAgents: row.max_agents,
    strategy: row.strategy,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class SwarmCoordinator {
  constructor(private readonly db: Database.Database) {}

  /** Create a new (pending) swarm session from a validated config. */
  init(input: SwarmConfigInput): SwarmSession {
    const config = SwarmConfigSchema.parse(input)
    const id = randomUUID()
    const nowIso = new Date().toISOString()

    this.db
      .prepare(
        `INSERT INTO swarm_sessions (id, topology, consensus, status, max_agents, strategy, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`,
      )
      .run(id, config.topology, config.consensus, config.maxAgents, config.strategy, nowIso, nowIso)

    log.info('swarm:init', { id, topology: config.topology, consensus: config.consensus })
    return this.status(id)
  }

  /** Transition a session to active. Throws if the session does not exist. */
  start(sessionId: string): SwarmSession {
    const result = this.db
      .prepare("UPDATE swarm_sessions SET status = 'active', updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), sessionId)

    if (result.changes === 0) {
      throw new McpGraphError(`Swarm session not found: ${sessionId}`)
    }

    log.info('swarm:start', { sessionId })
    return this.status(sessionId)
  }

  /** Stop a session: clear its agents and mark it stopped (single transaction). */
  stop(sessionId: string): SwarmSession {
    const session = this.getRow(sessionId)
    if (!session) {
      throw new McpGraphError(`Swarm session not found: ${sessionId}`)
    }

    this.db.transaction(() => {
      this.db.prepare('DELETE FROM swarm_agents WHERE session_id = ?').run(sessionId)
      this.db
        .prepare("UPDATE swarm_sessions SET status = 'stopped', updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), sessionId)
    })()

    log.info('swarm:stop', { sessionId })
    return this.status(sessionId)
  }

  /** Change the max-agent ceiling (1..32). Throws on out-of-range or unknown id. */
  scale(sessionId: string, newMax: number): SwarmSession {
    if (newMax < 1) {
      throw new McpGraphError(`maxAgents must be >= 1, got ${newMax}`)
    }
    if (newMax > 32) {
      throw new McpGraphError(`maxAgents ceiling is 32, got ${newMax}`)
    }

    const result = this.db
      .prepare('UPDATE swarm_sessions SET max_agents = ?, updated_at = ? WHERE id = ?')
      .run(newMax, new Date().toISOString(), sessionId)

    if (result.changes === 0) {
      throw new McpGraphError(`Swarm session not found: ${sessionId}`)
    }

    log.info('swarm:scale', { sessionId, newMax })
    return this.status(sessionId)
  }

  /** Read a session by id. Throws if it does not exist. */
  status(sessionId: string): SwarmSession {
    const row = this.getRow(sessionId)
    if (!row) {
      throw new McpGraphError(`Swarm session not found: ${sessionId}`)
    }
    return toSession(row)
  }

  private getRow(sessionId: string): SessionRow | undefined {
    return this.db.prepare('SELECT * FROM swarm_sessions WHERE id = ?').get(sessionId) as SessionRow | undefined
  }
}
