import { describe, it, expect } from 'vitest'
import type { AgentLeaseToken, AgentRecord, AgentRegistryOptions } from '../schemas/agent-registry.schema.js'

describe('AgentLeaseToken (TypeScript interface)', () => {
  it('can construct a valid lease token', () => {
    const token: AgentLeaseToken = {
      agentId: 'agent-001',
      roleName: 'worker',
      issuedAt: Date.now(),
    }
    expect(token.agentId).toBe('agent-001')
    expect(token.roleName).toBe('worker')
    expect(typeof token.issuedAt).toBe('number')
  })
})

describe('AgentRecord (TypeScript interface)', () => {
  it('can construct a running agent record', () => {
    const record: AgentRecord = {
      agentId: 'agent-002',
      instanceName: 'worker-1',
      roleName: 'worker',
      role: {
        model: 'claude-haiku-4-5-20251001',
        tools: ['read'],
        permissions: 'read-only',
        reasoning: false,
        maxRetries: 2,
        timeoutMs: 120_000,
      },
      parentId: 'root',
      status: 'running',
      startedAt: 1_000_000,
    }
    expect(record.status).toBe('running')
    expect(record.stoppedAt).toBeUndefined()
  })

  it('can construct a stopped agent record', () => {
    const record: AgentRecord = {
      agentId: 'agent-003',
      instanceName: 'worker-2',
      roleName: 'worker',
      role: {
        model: 'gpt-4',
        tools: ['bash'],
        permissions: 'workspace-write',
        reasoning: true,
        maxRetries: 0,
        timeoutMs: 60_000,
      },
      parentId: 'root',
      status: 'stopped',
      startedAt: 1_000_000,
      stoppedAt: 1_001_000,
    }
    expect(record.status).toBe('stopped')
    expect(record.stoppedAt).toBe(1_001_000)
  })
})

describe('AgentRegistryOptions (TypeScript interface)', () => {
  it('can construct with defaults omitted', () => {
    const opts: AgentRegistryOptions = {}
    expect(opts.maxSpawns).toBeUndefined()
  })

  it('can construct with full options', () => {
    const opts: AgentRegistryOptions = {
      maxSpawns: 10,
      roleLimits: { worker: 5, orchestrator: 1 },
    }
    expect(opts.maxSpawns).toBe(10)
  })
})
