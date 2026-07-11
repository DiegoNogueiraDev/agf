/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §S1.4 — Multi-agent WIP gate. WIP=1 por agentId, com capacidade por role
 * configurável e lease token exclusivo.
 */

export interface AcquireResult {
  acquired: boolean
  reason?: string
}

export interface WipGateOptions {
  defaultCapacity?: number
  roleCapacities?: Record<string, number>
}

export class MultiAgentWipGate {
  private readonly active = new Map<string, string>() // agentId → role
  private readonly roleCounts = new Map<string, number>()
  private readonly capacities: Map<string, number>

  constructor(options: WipGateOptions = {}) {
    this.capacities = new Map(Object.entries(options.roleCapacities ?? {}))
    this.capacities.set('default', options.defaultCapacity ?? 1)
  }

  tryAcquire(agentId: string, roleName: string): AcquireResult {
    if (this.active.has(agentId)) {
      return { acquired: false, reason: `Agent "${agentId}" already has an active WIP slot` }
    }

    const currentCount = this.roleCounts.get(roleName) ?? 0
    const cap = this.capacities.get(roleName) ?? this.capacities.get('default') ?? 1

    if (currentCount >= cap) {
      return { acquired: false, reason: `WIP cap (${cap}) reached for role "${roleName}"` }
    }

    this.active.set(agentId, roleName)
    this.roleCounts.set(roleName, currentCount + 1)
    return { acquired: true }
  }

  release(agentId: string, roleName: string): void {
    if (!this.active.has(agentId)) {
      throw new SchemaError(`Agent "${agentId}" not found in WIP gate`)
    }
    this.active.delete(agentId)
    const currentCount = this.roleCounts.get(roleName) ?? 0
    if (currentCount > 0) {
      this.roleCounts.set(roleName, currentCount - 1)
    }
  }

  activeCount(roleName: string): number {
    return this.roleCounts.get(roleName) ?? 0
  }

  isActive(agentId: string): boolean {
    return this.active.has(agentId)
  }

  totalActive(): number {
    return this.active.size
  }

  listActive(): Array<{ agentId: string; roleName: string }> {
    return Array.from(this.active.entries()).map(([agentId, roleName]) => ({ agentId, roleName }))
  }
}

class SchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SchemaError'
  }
}
