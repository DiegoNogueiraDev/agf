/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'
import { parse as parseToml } from 'smol-toml'

export const AgentPermissionSchema = z.enum(['read-only', 'workspace-write', 'danger-full-access'])
export type AgentPermission = z.infer<typeof AgentPermissionSchema>

/** Zod schema for a single agent role — model, toolset, permissions, and retry config. */
export const AgentRoleSchema = z.object({
  model: z.string().min(1).describe('LLM model ID for this agent role'),
  reasoning: z.boolean().default(false).describe('Enable reasoning/thinking mode'),
  tools: z.array(z.string()).min(1).describe('Allowed tool names for this role'),
  permissions: AgentPermissionSchema.describe('Permission level for tool execution'),
  maxRetries: z.number().int().min(0).default(2).describe('Max retry attempts on failure'),
  timeoutMs: z.number().int().positive().default(120_000).describe('Max execution time in ms'),
})
export type AgentRole = z.infer<typeof AgentRoleSchema>

export const AgentRoleConfigSchema = z.object({
  agent: z.record(z.string().min(1), AgentRoleSchema).refine((agents) => Object.keys(agents).length > 0, {
    message: 'At least one agent role must be defined under [agent.*]',
  }),
})
export type AgentRoleConfig = z.infer<typeof AgentRoleConfigSchema>

export const BUILT_IN_ROLES: Record<string, AgentRole> = {
  awaiter: {
    model: 'haiku',
    reasoning: false,
    tools: ['read', 'search', 'glob', 'grep', 'context', 'list'],
    permissions: 'read-only',
    maxRetries: 3,
    timeoutMs: 600_000,
  },
  explorer: {
    model: 'haiku',
    reasoning: false,
    tools: ['read', 'search', 'glob', 'grep', 'context', 'list', 'show', 'export', 'status'],
    permissions: 'read-only',
    maxRetries: 2,
    timeoutMs: 300_000,
  },
  builder: {
    model: 'sonnet',
    reasoning: true,
    tools: ['read', 'write', 'edit', 'search', 'glob', 'grep', 'bash', 'context', 'list', 'show', 'status', 'validate'],
    permissions: 'workspace-write',
    maxRetries: 2,
    timeoutMs: 300_000,
  },
  reviewer: {
    model: 'haiku',
    reasoning: false,
    tools: ['read', 'search', 'glob', 'grep', 'list', 'show', 'export', 'status', 'metrics'],
    permissions: 'read-only',
    maxRetries: 1,
    timeoutMs: 120_000,
  },
}

/** Parse a TOML string into `AgentRoleConfig`, returning `{success,data}` or `{success:false,error}`. */
export function parseAgentRoleConfig(tomlString: string): {
  success: boolean
  data?: AgentRoleConfig
  error?: string
} {
  const trimmed = tomlString.trim()
  if (!trimmed) {
    return { success: false, error: 'Empty config' }
  }

  try {
    const parsed = parseToml(trimmed) as Record<string, unknown>
    const result = AgentRoleConfigSchema.safeParse(parsed)
    if (result.success) {
      return { success: true, data: result.data }
    }
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    return { success: false, error: issues }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
}

/** Resolve role config by name — checks `config` first, then falls back to `BUILT_IN_ROLES`. */
export function getRoleConfig(roleName: string, config?: AgentRoleConfig): AgentRole {
  const role = config?.agent?.[roleName] ?? BUILT_IN_ROLES[roleName]
  if (!role) {
    throw new SchemaError(`Unknown agent role "${roleName}". Built-in: ${Object.keys(BUILT_IN_ROLES).join(', ')}`)
  }
  return role
}

/** Return the names of all built-in role configurations (e.g. "planner", "executor"). */
export function listBuiltInRoleNames(): string[] {
  return Object.keys(BUILT_IN_ROLES)
}

class SchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SchemaError'
  }
}
