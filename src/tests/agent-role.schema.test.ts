import { describe, it, expect } from 'vitest'
import { AgentPermissionSchema, AgentRoleSchema, AgentRoleConfigSchema } from '../schemas/agent-role.schema.js'

describe('AgentPermissionSchema', () => {
  it('accepts valid permissions', () => {
    for (const p of ['read-only', 'workspace-write', 'danger-full-access']) {
      expect(AgentPermissionSchema.safeParse(p).success).toBe(true)
    }
  })

  it('rejects unknown permission', () => {
    expect(AgentPermissionSchema.safeParse('admin').success).toBe(false)
  })
})

describe('AgentRoleSchema', () => {
  it('accepts a valid role', () => {
    const result = AgentRoleSchema.safeParse({
      model: 'claude-sonnet-4-6',
      tools: ['read', 'write'],
      permissions: 'workspace-write',
    })
    expect(result.success).toBe(true)
  })

  it('defaults reasoning to false', () => {
    const result = AgentRoleSchema.safeParse({
      model: 'gpt-4',
      tools: ['bash'],
      permissions: 'read-only',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.reasoning).toBe(false)
  })

  it('rejects empty tools array', () => {
    expect(
      AgentRoleSchema.safeParse({
        model: 'gpt-4',
        tools: [],
        permissions: 'read-only',
      }).success,
    ).toBe(false)
  })
})

describe('AgentRoleConfigSchema', () => {
  it('accepts valid config with one role', () => {
    expect(
      AgentRoleConfigSchema.safeParse({
        agent: {
          worker: {
            model: 'claude-haiku-4-5-20251001',
            tools: ['read'],
            permissions: 'read-only',
          },
        },
      }).success,
    ).toBe(true)
  })

  it('rejects empty agent record', () => {
    expect(AgentRoleConfigSchema.safeParse({ agent: {} }).success).toBe(false)
  })
})
