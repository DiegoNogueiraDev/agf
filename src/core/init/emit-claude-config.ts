/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod/v4'
import type { ScaffoldChange } from './scaffold.js'

/**
 * `.claude/settings.local.json` emitter.
 *
 * Project-scoped settings — gitignored, doesn't override the user's global
 * Claude Code settings. We register:
 *   - permissions allow-list for our MCP tools (so prompts don't fire)
 *   - hook entries (filled in by Sprint 7.5; this emitter ships scaffolding)
 *
 * Idempotent: if the user has manually edited the file, we merge our keys
 * in without clobbering theirs.
 */

export interface ClaudeConfigOptions {
  readonly force?: boolean
  readonly dryRun?: boolean
}

interface ClaudeSettings {
  permissions?: { allow?: string[] }
  hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>>
  [key: string]: unknown
}

const PERMISSION_ALLOW = ['mcp__mcp-graph__*', 'Bash(mg:*)', 'Bash(mcp-graph:*)']

export function emitClaudeSettings(cwd: string, opts: ClaudeConfigOptions = {}): ScaffoldChange {
  const path = join(cwd, '.claude', 'settings.local.json')
  const exists = existsSync(path)
  const current: ClaudeSettings = exists ? (safeParse(readFileSync(path, 'utf8')) ?? {}) : {}

  const next = mergeSettings(current)
  const nextJson = `${JSON.stringify(next, null, 2)}\n`

  if (exists && !opts.force) {
    const currentJson = readFileSync(path, 'utf8')
    if (currentJson === nextJson) {
      return { path, action: 'skipped-noop', bytes: currentJson.length }
    }
  }

  if (!opts.dryRun) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, nextJson, 'utf8')
  }
  return {
    path,
    action: exists ? 'patched' : 'created',
    bytes: nextJson.length,
  }
}

function mergeSettings(current: ClaudeSettings): ClaudeSettings {
  const allow = new Set<string>(current.permissions?.allow ?? [])
  for (const entry of PERMISSION_ALLOW) allow.add(entry)

  return {
    ...current,
    permissions: {
      ...(current.permissions ?? {}),
      allow: Array.from(allow).sort(),
    },
  }
}

const claudeSettingsSchema = z
  .object({
    permissions: z.object({ allow: z.array(z.string()).optional() }).optional(),
    hooks: z.record(z.string(), z.array(z.unknown())).optional(),
  })
  .passthrough()

/** Parse and validate an external ClaudeSettings JSON string. Returns null on any error. */
export function parseClaudeSettings(s: string): ClaudeSettings | null {
  try {
    const raw: unknown = JSON.parse(s)
    return claudeSettingsSchema.parse(raw) as ClaudeSettings
  } catch {
    return null
  }
}

function safeParse(s: string): ClaudeSettings | null {
  return parseClaudeSettings(s)
}
