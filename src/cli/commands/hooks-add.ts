/*!
 * hooks-add — pure logic for `agf hooks add`.
 *
 * WHY: `agf hooks add` scaffolds a hook entry into .mcp-graph/hooks.json
 * (project or user scope) without touching the in-process hook registry.
 * Keeps the write logic testable independently of CLI plumbing.
 *
 * Composing: hooks-cmd.ts wires this into Commander; config-loader.ts owns the
 * read path; native-format-emitters.ts provides the --emit snippet.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { HOOK_CHANNELS, assertHookChannel, type HookChannel } from '../../core/hooks/hook-types.js'
import { ValidationError } from '../../core/utils/errors.js'
import { emitNative, type NativeFormat, type CanonicalHookSpec } from '../../core/hooks/native-format-emitters.js'
import type { HookConfigFile, HookHandlerConfig } from '../../core/hooks/config-loader.js'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AddHookOptions {
  channel: string
  command: string
  /** Working directory (project scope root). */
  dir: string
  /** 'project' writes to <dir>/.mcp-graph/hooks.json; 'user' to ~/.mcp-graph/hooks.json */
  scope?: 'project' | 'user'
  /** Emit native snippet for a supported CLI. */
  emit?: NativeFormat | string
  /** Optional description for the hook entry. */
  description?: string
}

export interface AddHookResult {
  written: boolean
  configPath: string
  channel: HookChannel
  id: string
  /** JSON string of the native format if --emit was requested. */
  nativeSnippet?: string
}

/**
 * Validates a channel string against the 28-channel taxonomy.
 * Throws with a message listing valid channels if unknown.
 */
export function validateHookChannel(channel: string): HookChannel {
  try {
    return assertHookChannel(channel)
  } catch {
    throw new ValidationError(`Unknown channel "${channel}". Valid channels:\n  ${HOOK_CHANNELS.join('\n  ')}`, [])
  }
}

/**
 * Adds a hook entry to the target hooks.json config file (project or user scope).
 * Creates the file (version:1) if absent. Appends to existing entries.
 * Returns the written result and an optional native CLI snippet.
 */
export function addHookEntry(opts: AddHookOptions): AddHookResult {
  const ch = validateHookChannel(opts.channel)
  const scope = opts.scope ?? 'project'
  const configPath =
    scope === 'user' ? join(homedir(), '.mcp-graph', 'hooks.json') : join(opts.dir, '.mcp-graph', 'hooks.json')

  // Read or init the config file.
  let cfg: HookConfigFile = { version: 1, hooks: {} }
  if (existsSync(configPath)) {
    try {
      cfg = JSON.parse(readFileSync(configPath, 'utf-8')) as HookConfigFile
    } catch {
      cfg = { version: 1, hooks: {} }
    }
  }

  if (!cfg.hooks) cfg = { ...cfg, hooks: {} }

  const id = `hook-${ch.replace(/[^a-z0-9]/g, '-')}-${randomUUID().slice(0, 8)}`
  const entry = {
    id,
    channel: ch,
    kind: 'shell' as const,
    command: opts.command,
    ...(opts.description ? { description: opts.description } : {}),
  }

  const existing = cfg.hooks![ch] ?? []
  cfg = { ...cfg, hooks: { ...cfg.hooks, [ch]: [...existing, entry] } }

  // Ensure directory exists, then write.
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n', 'utf-8')

  // Build optional native snippet.
  let nativeSnippet: string | undefined
  if (opts.emit && ['codex', 'opencode', 'copilot'].includes(opts.emit)) {
    const spec: CanonicalHookSpec = {
      id,
      cli: 'claude',
      event: 'pretooluse',
      command: opts.command,
    }
    const native = emitNative([spec], opts.emit as NativeFormat)
    nativeSnippet = JSON.stringify(native, null, 2)
  }

  return { written: true, configPath, channel: ch, id, nativeSnippet }
}

export interface ImportHooksOptions {
  entries: HookHandlerConfig[]
  dir: string
  scope?: 'project' | 'user'
}

export interface ImportHooksResult {
  written: boolean
  configPath: string
  addedCount: number
}

/**
 * Merge already-built HookHandlerConfig entries (e.g. from
 * claude-code-importer.ts) into the target hooks.json, grouped by channel.
 * Additive only — never removes or overwrites an existing entry.
 */
export function mergeImportedHooksIntoConfig(opts: ImportHooksOptions): ImportHooksResult {
  const scope = opts.scope ?? 'project'
  const configPath =
    scope === 'user' ? join(homedir(), '.mcp-graph', 'hooks.json') : join(opts.dir, '.mcp-graph', 'hooks.json')

  let cfg: HookConfigFile = { version: 1, hooks: {} }
  if (existsSync(configPath)) {
    try {
      cfg = JSON.parse(readFileSync(configPath, 'utf-8')) as HookConfigFile
    } catch {
      cfg = { version: 1, hooks: {} }
    }
  }
  if (!cfg.hooks) cfg = { ...cfg, hooks: {} }

  const hooks: Record<string, HookHandlerConfig[]> = { ...cfg.hooks }
  for (const entry of opts.entries) {
    const existing = hooks[entry.channel] ?? []
    hooks[entry.channel] = [...existing, entry]
  }
  cfg = { ...cfg, hooks }

  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n', 'utf-8')

  return { written: true, configPath, addedCount: opts.entries.length }
}
