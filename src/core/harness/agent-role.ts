/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Agent Role Registration — allows agents to register their role
 * (implementor, reviewer, validator) for a specific task.
 *
 * Persists in project settings as `agent_role_{taskId}`.
 * Used for contract enforcement in multi-agent workflows.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'agent-role.ts' })

// ── Types ───────────────────────────────────────────────

export type AgentRole = 'implementor' | 'reviewer' | 'validator'

export interface AgentRoleRegistration {
  role: AgentRole
  taskId: string
  registeredAt: string
  warning?: string
}

export interface StoredAgentRole {
  role: AgentRole
  registeredAt: string
}

// ── Functions ───────────────────────────────────────────

function settingsKey(taskId: string): string {
  return `agent_role_${taskId}`
}

/**
 * Register an agent's role for a specific task.
 * Persists in project settings. Returns warning if a different role was already registered.
 */
export function registerAgentRole(store: SqliteStore, role: AgentRole, taskId: string): AgentRoleRegistration {
  const key = settingsKey(taskId)
  const now = new Date().toISOString()

  // Check existing registration
  const existing = store.getProjectSetting(key)
  let warning: string | undefined

  if (existing) {
    try {
      const parsed = JSON.parse(existing) as StoredAgentRole
      if (parsed.role !== role) {
        warning = `Role already registered for ${taskId}: was '${parsed.role}', overwriting with '${role}'`
        log.warn('agent-role:overwrite', { taskId, oldRole: parsed.role, newRole: role })
      }
    } catch (err) {
      log.debug('intentional-swallow', { error: String(err), reason: 'corrupted setting — overwrite silently' })
    }
  }

  const value: StoredAgentRole = { role, registeredAt: now }
  store.setProjectSetting(key, JSON.stringify(value))

  log.debug('agent-role:register', { role, taskId })

  return { role, taskId, registeredAt: now, warning }
}

/**
 * Get the registered agent role for a task. Returns null if none registered.
 */
export function getAgentRole(store: SqliteStore, taskId: string): StoredAgentRole | null {
  const key = settingsKey(taskId)
  const raw = store.getProjectSetting(key)
  if (!raw) return null

  try {
    return JSON.parse(raw) as StoredAgentRole
  } catch {
    return null
  }
}
