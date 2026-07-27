/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  AgentRoleSchema,
  type AgentRole,
  AgentRoleConfigSchema,
  type AgentRoleConfig,
  BUILT_IN_ROLES,
  parseAgentRoleConfig,
  getRoleConfig,
  listBuiltInRoleNames,
} from '../schemas/agent-role.schema.js'

const MINIMAL_AWAITER_RAW = `[agent.awaiter]
model = "haiku"
tools = ["read", "search"]
permissions = "read-only"`

const FULL_CONFIG_RAW = `[agent.builder]
model = "sonnet"
reasoning = true
tools = ["read", "write", "shell", "bash", "glob", "grep"]
permissions = "workspace-write"
maxRetries = 3
timeoutMs = 300000`

const TWO_ROLES_RAW = `[agent.explorer]
model = "haiku"
tools = ["read", "search"]
permissions = "read-only"

[agent.reviewer]
model = "sonnet"
tools = ["read", "glob"]
permissions = "read-only"`

describe('AgentRoleSchema — single role validation', () => {
  it('should validate a complete role object', () => {
    const role: AgentRole = {
      model: 'sonnet',
      reasoning: true,
      tools: ['read', 'write', 'shell'],
      permissions: 'workspace-write',
    }
    const result = AgentRoleSchema.safeParse(role)
    expect(result.success).toBe(true)
  })

  it('should apply defaults for optional fields', () => {
    const role: AgentRole = {
      model: 'haiku',
      tools: ['read'],
      permissions: 'read-only',
    }
    const result = AgentRoleSchema.safeParse(role)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.maxRetries).toBe(2)
    expect(result.data.timeoutMs).toBe(120_000)
    expect(result.data.reasoning).toBe(false)
  })

  it('should reject invalid permissions', () => {
    const role = {
      model: 'haiku',
      tools: ['read'],
      permissions: 'super-admin',
    }
    const result = AgentRoleSchema.safeParse(role)
    expect(result.success).toBe(false)
  })

  it('should reject empty tools array', () => {
    const role = {
      model: 'haiku',
      tools: [] as string[],
      permissions: 'read-only' as const,
    }
    const result = AgentRoleSchema.safeParse(role)
    expect(result.success).toBe(false)
  })

  it('should reject missing model', () => {
    const role = {
      tools: ['read'],
      permissions: 'read-only' as const,
    }
    const result = AgentRoleSchema.safeParse(role)
    expect(result.success).toBe(false)
  })

  it('should reject negative timeoutMs', () => {
    const role = {
      model: 'haiku',
      tools: ['read'],
      permissions: 'read-only' as const,
      timeoutMs: -1000,
    }
    const result = AgentRoleSchema.safeParse(role)
    expect(result.success).toBe(false)
  })
})

describe('AgentRoleConfigSchema — multi-role config validation', () => {
  it('should validate a single-role parsed config', () => {
    const result = AgentRoleConfigSchema.safeParse({
      agent: {
        awaiter: {
          model: 'haiku',
          tools: ['read', 'search'],
          permissions: 'read-only',
        },
      },
    })
    expect(result.success).toBe(true)
  })

  it('should validate multi-role parsed config', () => {
    const result = AgentRoleConfigSchema.safeParse({
      agent: {
        explorer: { model: 'haiku', tools: ['read'], permissions: 'read-only' },
        reviewer: { model: 'haiku', tools: ['glob'], permissions: 'read-only' },
      },
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(Object.keys(result.data.agent)).toHaveLength(2)
  })

  it('should reject empty agent object', () => {
    const result = AgentRoleConfigSchema.safeParse({ agent: {} })
    expect(result.success).toBe(false)
  })
})

describe('parseAgentRoleConfig — TOML → validation pipeline', () => {
  it('should parse minimal TOML config', () => {
    const result = parseAgentRoleConfig(MINIMAL_AWAITER_RAW)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data?.agent.awaiter).toBeDefined()
    expect(result.data?.agent.awaiter.model).toBe('haiku')
    expect(result.data?.agent.awaiter.tools).toEqual(['read', 'search'])
    expect(result.data?.agent.awaiter.permissions).toBe('read-only')
  })

  it('should parse full TOML config with all fields', () => {
    const result = parseAgentRoleConfig(FULL_CONFIG_RAW)
    expect(result.success).toBe(true)
    if (!result.success) return
    const builder = result.data.agent.builder
    expect(builder.model).toBe('sonnet')
    expect(builder.tools).toContain('write')
    expect(builder.permissions).toBe('workspace-write')
    expect(builder.reasoning).toBe(true)
    expect(builder.maxRetries).toBe(3)
    expect(builder.timeoutMs).toBe(300_000)
  })

  it('should parse multi-role TOML', () => {
    const result = parseAgentRoleConfig(TWO_ROLES_RAW)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(Object.keys(result.data.agent)).toHaveLength(2)
    expect(result.data.agent.explorer).toBeDefined()
    expect(result.data.agent.reviewer).toBeDefined()
  })

  it('should reject invalid TOML syntax', () => {
    const result = parseAgentRoleConfig('[[[ broken toml')
    expect(result.success).toBe(false)
  })

  it('should reject empty config', () => {
    expect(parseAgentRoleConfig('').success).toBe(false)
    expect(parseAgentRoleConfig('   ').success).toBe(false)
  })
})

describe('BUILT_IN_ROLES', () => {
  it('should have 4 built-in roles', () => {
    expect(Object.keys(BUILT_IN_ROLES)).toHaveLength(4)
  })

  it('each built-in role should pass AgentRoleSchema validation', () => {
    for (const role of Object.values(BUILT_IN_ROLES)) {
      const result = AgentRoleSchema.safeParse(role)
      expect(result.success).toBe(true)
    }
  })

  it('awaiter — polling/retry-focused, read-only, high retries', () => {
    const a = BUILT_IN_ROLES['awaiter']
    expect(a.model).toBe('haiku')
    expect(a.permissions).toBe('read-only')
    expect(a.maxRetries).toBe(3)
    expect(a.reasoning).toBe(false)
  })

  it('explorer — read-only search with broad tools', () => {
    const e = BUILT_IN_ROLES['explorer']
    expect(e.permissions).toBe('read-only')
    expect(e.tools.every((t) => !['write', 'edit', 'bash', 'shell'].includes(t))).toBe(true)
    expect(e.tools).toContain('export')
  })

  it('builder — full access with reasoning', () => {
    const b = BUILT_IN_ROLES['builder']
    expect(b.permissions).toBe('workspace-write')
    expect(b.tools).toContain('write')
    expect(b.tools).toContain('bash')
    expect(b.reasoning).toBe(true)
    expect(b.model).toBe('sonnet')
  })

  it('reviewer — read-only, limited tools', () => {
    const r = BUILT_IN_ROLES['reviewer']
    expect(r.permissions).toBe('read-only')
    expect(r.tools).not.toContain('write')
    expect(r.tools).not.toContain('bash')
    expect(r.maxRetries).toBe(1)
    expect(r.timeoutMs).toBe(120_000)
  })

  it('getRoleConfig returns built-in role by name', () => {
    expect(getRoleConfig('builder').model).toBe('sonnet')
    expect(getRoleConfig('explorer').permissions).toBe('read-only')
  })

  it('getRoleConfig allows override from config', () => {
    const config: AgentRoleConfig = {
      agent: {
        builder: { model: 'gpt-4', tools: ['read'], permissions: 'read-only' },
      },
    }
    expect(getRoleConfig('builder', config).model).toBe('gpt-4')
  })

  it('getRoleConfig throws for unknown role', () => {
    expect(() => getRoleConfig('nonexistent')).toThrow('Unknown agent role')
  })

  it('listBuiltInRoleNames returns 4 names', () => {
    const names = listBuiltInRoleNames()
    expect(names).toHaveLength(4)
    expect(names).toContain('awaiter')
    expect(names).toContain('builder')
    expect(names).toContain('explorer')
    expect(names).toContain('reviewer')
  })
})
