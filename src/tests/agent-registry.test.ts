/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { AgentRoleRegistry, type AgentRecord, type AgentLeaseToken } from '../schemas/agent-registry.schema.js'
import { BUILT_IN_ROLES } from '../schemas/agent-role.schema.js'

describe('AgentRoleRegistry — reserve/spawn/kill/status', () => {
  let registry: AgentRoleRegistry

  beforeEach(() => {
    registry = new AgentRoleRegistry({ maxSpawns: 10 })
  })

  describe('reserve', () => {
    it('should reserve(role) retorna leaseToken', () => {
      const token = registry.reserve('builder')
      expect(token).toBeDefined()
      expect(token.roleName).toBe('builder')
      expect(token.agentId).toMatch(/^agent_/)
      expect(token.issuedAt).toBeGreaterThan(0)
    })

    it('should throw for unknown role', () => {
      expect(() => registry.reserve('unknown')).toThrow(/Unknown agent role/)
    })

    it('should respect max spawns per role', () => {
      const limited = new AgentRoleRegistry({ maxSpawns: 2 })
      limited.reserve('builder')
      limited.reserve('builder')
      expect(() => limited.reserve('builder')).toThrow(/limit/)
    })

    it('should allow different roles up to their limits', () => {
      const limited = new AgentRoleRegistry({ roleLimits: { awaiter: 1, explorer: 2 } })
      limited.reserve('awaiter')
      expect(() => limited.reserve('awaiter')).toThrow(/limit/)
      limited.reserve('explorer')
      limited.reserve('explorer')
      expect(() => limited.reserve('explorer')).toThrow(/limit/)
    })
  })

  describe('spawn', () => {
    it('should spawn(parentId, role) cria AgentDriver independente', () => {
      const record = registry.spawn('task_123', 'builder')
      expect(record).toBeDefined()
      expect(record.agentId).toMatch(/^agent_/)
      expect(record.roleName).toBe('builder')
      expect(record.parentId).toBe('task_123')
      expect(record.status).toBe('running')
      expect(record.instanceName).toMatch(/^builder-\d+$/)
    })

    it('should spawn multiple agents with auto-increment nicknames', () => {
      const a1 = registry.spawn('task_1', 'explorer')
      const a2 = registry.spawn('task_2', 'explorer')
      const a3 = registry.spawn('task_3', 'explorer')
      expect(a1.instanceName).toBe('explorer-1')
      expect(a2.instanceName).toBe('explorer-2')
      expect(a3.instanceName).toBe('explorer-3')
    })

    it('should spawn with reserved lease token', () => {
      const token = registry.reserve('builder')
      const record = registry.spawn('task_1', 'builder', token)
      expect(record.status).toBe('running')
    })

    it('should reject invalid lease token', () => {
      const badToken: AgentLeaseToken = {
        agentId: 'agent_fake',
        roleName: 'builder',
        issuedAt: 0,
      }
      expect(() => registry.spawn('task_1', 'builder', badToken)).toThrow(/Invalid lease token/)
    })

    it('should spawn with different roles', () => {
      const r1 = registry.spawn('task_1', 'builder')
      const r2 = registry.spawn('task_2', 'explorer')
      const r3 = registry.spawn('task_3', 'reviewer')
      expect(r1.roleName).toBe('builder')
      expect(r2.roleName).toBe('explorer')
      expect(r3.roleName).toBe('reviewer')
    })
  })

  describe('list / kill / status', () => {
    it('should list() return all active agents', () => {
      registry.spawn('t1', 'builder')
      registry.spawn('t2', 'explorer')
      const all = registry.list()
      expect(all).toHaveLength(2)
    })

    it('should kill(agentId) mark agent as stopped', () => {
      const record = registry.spawn('t1', 'builder')
      expect(record.status).toBe('running')

      registry.kill(record.agentId)
      const updated = registry.get(record.agentId)
      expect(updated?.status).toBe('stopped')
    })

    it('should kill() throw for unknown agent', () => {
      expect(() => registry.kill('agent_nonexistent')).toThrow(/not found/)
    })

    it('should get() return undefined for unknown agent', () => {
      expect(registry.get('agent_nonexistent')).toBeUndefined()
    })

    it('should list() only return running agents after kill', () => {
      const a = registry.spawn('t1', 'builder')
      registry.spawn('t2', 'explorer')
      registry.kill(a.agentId)
      const running = registry.list()
      expect(running).toHaveLength(1)
      expect(running[0]?.roleName).toBe('explorer')
    })

    it('should get() return agent record with all fields', () => {
      const record = registry.spawn('task_parent', 'reviewer')
      const fetched = registry.get(record.agentId)
      expect(fetched).toBeDefined()
      expect(fetched?.agentId).toBe(record.agentId)
      expect(fetched?.instanceName).toMatch(/^reviewer-\d+$/)
      expect(fetched?.parentId).toBe('task_parent')
      expect(fetched?.roleName).toBe('reviewer')
      expect(fetched?.status).toBe('running')
      expect(fetched?.role).toBeDefined()
      expect(fetched?.role.model).toBe('haiku')
    })
  })

  describe('edge cases', () => {
    it('should handle spawn with reserve then kill', () => {
      const a = registry.spawn('t1', 'builder')
      registry.kill(a.agentId)
      const refreshed = registry.get(a.agentId)
      expect(refreshed?.status).toBe('stopped')
    })

    it('should allow spawning after kill (slot freed)', () => {
      const a = registry.spawn('t1', 'builder')
      registry.kill(a.agentId)

      const b = registry.spawn('t2', 'builder')
      expect(b.agentId).not.toBe(a.agentId)
      expect(b.status).toBe('running')
    })
  })
})
