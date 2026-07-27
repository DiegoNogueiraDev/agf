/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Agent Registry — tracks active agents with heartbeat-based health.
 *
 * In-memory registry (not persisted in SQLite). Agents are considered
 * inactive if no heartbeat received within HEARTBEAT_TIMEOUT_MS (60s).
 * Lists active locks from resource_locks table for each agent.
 */

import type Database from 'better-sqlite3'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'agent-registry.ts' })

const HEARTBEAT_TIMEOUT_MS = 60_000 // 60 seconds

// ── Types ───────────────────────────────────────────────

export type AgentStatus = 'active' | 'inactive'

export interface AgentInfo {
  agentId: string
  capabilities: string[]
  status: AgentStatus
  lastHeartbeat: string
  activeLocks: number
  registeredAt: string
}

interface AgentEntry {
  agentId: string
  capabilities: string[]
  lastHeartbeat: number // epoch ms
  registeredAt: string
}

// ── Registry ────────────────────────────────────────────

export class AgentRegistry {
  private readonly agents = new Map<string, AgentEntry>()

  constructor(private readonly db: Database.Database) {}

  /**
   * Register an agent with capabilities. Updates heartbeat if already registered.
   */
  registerAgent(agentId: string, capabilities: string[]): void {
    const now = Date.now()
    const existing = this.agents.get(agentId)

    if (existing) {
      existing.capabilities = capabilities
      existing.lastHeartbeat = now
    } else {
      this.agents.set(agentId, {
        agentId,
        capabilities,
        lastHeartbeat: now,
        registeredAt: new Date(now).toISOString(),
      })
    }

    log.debug('agent-registry:register', { agentId, capabilities: capabilities.length })
  }

  /**
   * Update heartbeat for an agent. No-op if agent not registered.
   */
  heartbeat(agentId: string): void {
    const entry = this.agents.get(agentId)
    if (entry) {
      entry.lastHeartbeat = Date.now()
    }
  }

  /**
   * Remove an agent from the registry.
   */
  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId)
    log.debug('agent-registry:unregister', { agentId })
  }

  /**
   * List all registered agents with current status and active lock count.
   */
  listAgents(): AgentInfo[] {
    const now = Date.now()

    return [...this.agents.values()].map((entry) => {
      const status: AgentStatus = now - entry.lastHeartbeat > HEARTBEAT_TIMEOUT_MS ? 'inactive' : 'active'

      const activeLocks = this.countActiveLocks(entry.agentId)

      return {
        agentId: entry.agentId,
        capabilities: entry.capabilities,
        status,
        lastHeartbeat: new Date(entry.lastHeartbeat).toISOString(),
        activeLocks,
        registeredAt: entry.registeredAt,
      }
    })
  }

  /**
   * Count active (non-expired) locks held by an agent.
   */
  private countActiveLocks(agentId: string): number {
    try {
      const now = new Date().toISOString()
      const row = this.db
        .prepare('SELECT COUNT(*) as count FROM resource_locks WHERE agent_id = ? AND expires_at > ?')
        .get(agentId, now) as { count: number } | undefined
      return row?.count ?? 0
    } catch {
      return 0
    }
  }
}
