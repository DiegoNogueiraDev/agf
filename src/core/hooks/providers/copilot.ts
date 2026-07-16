/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { HookChannel } from '../hook-types.js'
import type { HookHandlerConfig } from '../config-loader.js'
import { readSettingsFile, generateHandlerId, type ImportEnvelope } from '../import-helpers.js'
import { createLogger } from '../../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'copilot.ts' })

/**
 * GitHub Copilot CLI provider — reads `.github/hooks/*.{json,toml}`.
 *
 * Hook entry shape (Copilot CLI docs):
 *   {
 *     "type": "block" | "inspect" | "modify",
 *     "event": "PreToolUse" | "PostToolUse" | ...,
 *     "matcher": "Bash",                 // optional tool filter
 *     "command": "/path/to/script",      // shell command
 *     "extension": "ext-name.mjs"        // alt: invoke mjs extension
 *   }
 *
 * v1: type=block and inspect → kind=shell handler. type=modify is skipped
 * (would require returning modified args back to the caller — out of scope).
 */

export const copilotAliases: Record<string, HookChannel | null> = {
  PreToolUse: 'tool:pre-call',
  PostToolUse: 'tool:post-call',
  SessionStart: 'session:start',
  SessionEnd: 'session:end',
  Stop: 'task:post-complete',
  // Copilot session.on() events:
  'session.tool_call': 'tool:pre-call',
  'session.tool_result': 'tool:post-call',
  'session.error': 'task:error',
}

interface CopilotHookEntry {
  type?: 'block' | 'inspect' | 'modify'
  event?: string
  matcher?: string
  command?: string
  extension?: string
  timeout?: number
}

export interface CopilotImportOptions {
  source?: string // path to .github/hooks/ dir
}

/** importCopilotSettings —  */
export function importCopilotSettings(opts: CopilotImportOptions = {}): ImportEnvelope {
  const source = opts.source ?? join(process.cwd(), '.github', 'hooks')
  const envelope: ImportEnvelope = {
    imported: [],
    skipped: [],
    source,
    provider: 'copilot',
  }

  if (!existsSync(source)) {
    envelope.skipped.push({ event: '*', reason: `source not found: ${source}` })
    return envelope
  }

  let files: string[]
  try {
    files = readdirSync(source).filter((f) => f.endsWith('.json') || f.endsWith('.toml'))
  } catch (err) {
    envelope.skipped.push({ event: '*', reason: `cannot read dir: ${String(err)}` })
    return envelope
  }

  let entryIdx = 0
  for (const filename of files) {
    const path = join(source, filename)
    const parser = filename.endsWith('.toml') ? 'toml' : 'json'
    const file = readSettingsFile<CopilotHookEntry | { hooks?: CopilotHookEntry[] }>(path, parser)
    if (!file.ok) {
      envelope.skipped.push({ event: filename, reason: file.reason })
      continue
    }
    const entries = normalizeEntries(file.data)
    for (const entry of entries) {
      const resultValue = entryToHandler(entry, entryIdx)
      if ('skip' in resultValue) {
        envelope.skipped.push({ event: entry.event ?? filename, reason: resultValue.skip })
      } else {
        envelope.imported.push(resultValue)
      }
      entryIdx++
    }
  }

  log.info('hooks:import:done', {
    provider: 'copilot',
    source,
    imported: envelope.imported.length,
    skipped: envelope.skipped.length,
  })
  return envelope
}

function normalizeEntries(data: CopilotHookEntry | { hooks?: CopilotHookEntry[] }): CopilotHookEntry[] {
  if (data && typeof data === 'object' && 'hooks' in data && Array.isArray((data as { hooks?: unknown }).hooks)) {
    return (data as { hooks: CopilotHookEntry[] }).hooks
  }
  if (data && typeof data === 'object' && 'type' in data) {
    return [data as CopilotHookEntry]
  }
  return []
}

function entryToHandler(entry: CopilotHookEntry, idx: number): HookHandlerConfig | { skip: string } {
  if (entry.type === 'modify') return { skip: 'modify hooks not supported in v1' }
  if (!entry.event) return { skip: 'missing event field' }
  const channel = copilotAliases[entry.event]
  if (channel == null) return { skip: `no mcp-graph analog for event ${entry.event}` }
  if (!entry.command && !entry.extension) return { skip: 'neither command nor extension specified' }

  const id = generateHandlerId('copilot', entry.event, idx, 0)
  const matcher = entry.matcher ? `${channel}(toolName:${entry.matcher})` : undefined
  const timeoutMs = entry.timeout ? entry.timeout * 1000 : 5000

  if (entry.extension) {
    // .mjs extension → mjs-module shim (kind=shell invoking node)
    return {
      id,
      channel,
      matcher,
      kind: 'mjs-module',
      command: entry.extension,
      timeoutMs,
      priority: 0,
      enabled: true,
      description: `Imported from Copilot CLI extension ${entry.extension}`,
      agentSource: 'copilot',
    }
  }
  return {
    id,
    channel,
    matcher,
    kind: 'shell',
    command: '/bin/sh',
    commandArgs: ['-c', entry.command as string],
    timeoutMs,
    priority: 0,
    enabled: true,
    description: `Imported from Copilot CLI hook ${entry.event} (type=${entry.type ?? 'inspect'})`,
    agentSource: 'copilot',
  }
}

/**
 * Stub for Copilot CLI's session.on() event observer (M3.3).
 *
 * Real implementation needs `gh copilot` to be a long-running subprocess
 * we wrap and tail — out of scope for v1. Returns no-op disposer + logs
 * the gap so users see it explicitly.
 */
export function installCopilotEventBridge(): () => void {
  log.warn('copilot:event-bridge:not-implemented-in-v1', {
    note: 'session.on() observer needs gh copilot subprocess wrap; planned for v2',
  })
  return () => {
    /* no-op */
  }
}
