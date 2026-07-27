/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod/v4'
import { HookChannelSchema, type HookChannel } from './hook-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'config-loader.ts' })

/**
 * 3-level config loader for runtime hook handlers.
 *
 * Precedence (later wins on `id` collision): user → project → local.
 * Mirrors Claude Code's settings.local.json model so a developer can
 * commit project-wide hooks (`.mcp-graph/hooks.json`) and override
 * locally without touching the committed file.
 */

export const HookHandlerKindSchema = z.enum(['shell', 'inline-unsafe', 'module', 'mjs-module'])
export type HookHandlerKind = z.infer<typeof HookHandlerKindSchema>

export const AgentSourceSchema = z.enum([
  'claude',
  'codex',
  'opencode',
  'copilot',
  'cursor',
  'windsurf',
  'gemini',
  'aider',
  'continue',
  'cline',
  'mcp-graph',
  'unknown',
])
export type AgentSource = z.infer<typeof AgentSourceSchema>

export const HookHandlerConfigSchema = z.object({
  id: z.string().min(1),
  channel: HookChannelSchema,
  matcher: z.string().optional(),
  kind: HookHandlerKindSchema,
  command: z.string().optional(),
  commandArgs: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
  description: z.string().optional(),
  /** Sprint M0 (Multi-CLI PRD): which agent CLI this handler is attributed to.
   *  Defaults to "mcp-graph" when omitted (backward-compat). */
  agentSource: AgentSourceSchema.optional(),
})

export type HookHandlerConfig = z.infer<typeof HookHandlerConfigSchema>

export const HookConfigFileSchema = z.object({
  version: z.literal(1),
  hooks: z.record(z.string(), z.array(HookHandlerConfigSchema)).optional(),
  graphEventBridge: z.record(z.string(), z.array(HookChannelSchema)).optional(),
})

export type HookConfigFile = z.infer<typeof HookConfigFileSchema>

export interface MergedHookConfig {
  handlers: HookHandlerConfig[]
  graphEventBridge: Record<string, HookChannel[]>
  sources: Array<{ path: string; loaded: boolean; reason?: string }>
}

const DEFAULT_PATHS = {
  user: () => join(homedir(), '.mcp-graph', 'hooks.json'),
  project: (cwd: string) => join(cwd, '.mcp-graph', 'hooks.json'),
  local: (cwd: string) => join(cwd, '.mcp-graph', 'hooks.local.json'),
}

export interface LoadHookConfigOptions {
  cwd?: string
  /** Override default paths — useful for testing. */
  paths?: { user?: string; project?: string; local?: string }
}

/** loadHookConfig —  */
export function loadHookConfig(options: LoadHookConfigOptions = {}): MergedHookConfig {
  const cwd = options.cwd ?? process.cwd()
  const paths = {
    user: options.paths?.user ?? DEFAULT_PATHS.user(),
    project: options.paths?.project ?? DEFAULT_PATHS.project(cwd),
    local: options.paths?.local ?? DEFAULT_PATHS.local(cwd),
  }

  const sources: MergedHookConfig['sources'] = []
  const byId = new Map<string, HookHandlerConfig>()
  const bridge: Record<string, HookChannel[]> = {}

  // Apply user → project → local so later wins on id collision.
  for (const level of ['user', 'project', 'local'] as const) {
    const path = paths[level]
    const file = readFile(path)
    if (!file.ok) {
      sources.push({ path, loaded: false, reason: file.reason })
      continue
    }
    const parsed = HookConfigFileSchema.safeParse(file.data)
    if (!parsed.success) {
      log.warn('hooks:config:invalid', { path, error: parsed.error.message })
      sources.push({ path, loaded: false, reason: 'schema validation failed' })
      continue
    }
    sources.push({ path, loaded: true })
    if (parsed.data.hooks) {
      for (const list of Object.values(parsed.data.hooks)) {
        for (const handler of list) byId.set(handler.id, handler)
      }
    }
    if (parsed.data.graphEventBridge) {
      Object.assign(bridge, parsed.data.graphEventBridge)
    }
  }

  return {
    handlers: Array.from(byId.values()),
    graphEventBridge: bridge,
    sources,
  }
}

function readFile(path: string): { ok: true; data: unknown } | { ok: false; reason: string } {
  if (!existsSync(path)) return { ok: false, reason: 'file not found' }
  try {
    const raw = readFileSync(path, 'utf-8')
    return { ok: true, data: JSON.parse(raw) }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}
