/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { BUILT_IN_ROLES, type AgentRole } from './agent-role.schema.js'

export interface AgentLeaseToken {
  agentId: string
  roleName: string
  issuedAt: number
}

export interface AgentRecord {
  agentId: string
  instanceName: string
  roleName: string
  role: AgentRole
  parentId: string
  status: 'running' | 'stopped'
  startedAt: number
  stoppedAt?: number
}

/** Config for `AgentRoleRegistry` — optional global spawn cap and per-role limits. */
export interface AgentRegistryOptions {
  maxSpawns?: number
  roleLimits?: Record<string, number>
}

/**
 * In-memory registry for agent spawn lifecycle: reserve → spawn → kill.
 * Enforces per-role and global spawn limits via lease tokens.
 */
export class AgentRoleRegistry {
  private agents = new Map<string, AgentRecord>()
  private tokens = new Map<string, AgentLeaseToken>()
  private counters = new Map<string, number>()
  private nextCounter = 1
  private generateAgentId: () => string

  constructor(
    private readonly options: AgentRegistryOptions = {},
    idFactory?: () => string,
  ) {
    this.generateAgentId = idFactory ?? createIdFactory('agent')
  }

  reserve(roleName: string): AgentLeaseToken {
    const role = BUILT_IN_ROLES[roleName]
    if (!role) {
      throw new SchemaError(`Unknown agent role "${roleName}". Built-in: ${Object.keys(BUILT_IN_ROLES).join(', ')}`)
    }

    const current = this.countReservedForRole(roleName)
    const limit = this.options.roleLimits?.[roleName] ?? this.options.maxSpawns ?? Infinity
    if (current >= limit) {
      throw new SchemaError(`Agent role "${roleName}" spawn limit (${limit}) reached`)
    }

    const token: AgentLeaseToken = {
      agentId: this.generateAgentId(),
      roleName,
      issuedAt: Date.now(),
    }
    this.tokens.set(token.agentId, token)
    return token
  }

  spawn(parentId: string, roleName: string, token?: AgentLeaseToken): AgentRecord {
    const role = BUILT_IN_ROLES[roleName]
    if (!role) {
      throw new SchemaError(`Unknown agent role "${roleName}". Built-in: ${Object.keys(BUILT_IN_ROLES).join(', ')}`)
    }

    let agentId: string
    if (token) {
      const stored = this.tokens.get(token.agentId)
      if (!stored || stored.roleName !== roleName) {
        throw new SchemaError('Invalid lease token')
      }
      agentId = token.agentId
      this.tokens.delete(token.agentId)
    } else {
      const current = this.countReservedForRole(roleName)
      const limit = this.options.roleLimits?.[roleName] ?? this.options.maxSpawns ?? Infinity
      if (current >= limit) {
        throw new SchemaError(`Agent role "${roleName}" spawn limit (${limit}) reached`)
      }
      agentId = this.generateAgentId()
    }

    const counter = this.nextCounter++
    const nickname = this.nextNickname(roleName, counter)

    const record: AgentRecord = {
      agentId,
      instanceName: nickname,
      roleName,
      role: { ...role },
      parentId,
      status: 'running',
      startedAt: Date.now(),
    }

    this.agents.set(agentId, record)
    return record
  }

  kill(agentId: string): void {
    const record = this.agents.get(agentId)
    if (!record) {
      throw new SchemaError(`Agent "${agentId}" not found`)
    }
    record.status = 'stopped'
    record.stoppedAt = Date.now()
  }

  get(agentId: string): AgentRecord | undefined {
    return this.agents.get(agentId)
  }

  list(): AgentRecord[] {
    return Array.from(this.agents.values()).filter((a) => a.status === 'running')
  }

  listAll(): AgentRecord[] {
    return Array.from(this.agents.values())
  }

  private countActiveForRole(roleName: string): number {
    let count = 0
    for (const agent of this.agents.values()) {
      if (agent.roleName === roleName && agent.status === 'running') count++
    }
    return count
  }

  private countReservedForRole(roleName: string): number {
    let count = this.countActiveForRole(roleName)
    for (const token of this.tokens.values()) {
      if (token.roleName === roleName) count++
    }
    return count
  }

  private nextNickname(roleName: string, counter: number): string {
    const prefix = this.counters.get(roleName) ?? 1
    this.counters.set(roleName, prefix + 1)
    return `${roleName}-${counter}`
  }
}

/** Create a monotonic ID factory that returns `<prefix>_<timestamp>_<counter>_<random>` strings. */
export function createIdFactory(prefix: string): () => string {
  let counter = 0
  return () => {
    counter++
    return `${prefix}_${Date.now()}_${counter}_${Math.random().toString(36).slice(2, 8)}`
  }
}

class SchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SchemaError'
  }
}
