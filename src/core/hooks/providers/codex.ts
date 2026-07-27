/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import type { HookChannel } from '../hook-types.js'
import type { HookHandlerConfig } from '../config-loader.js'
import { readSettingsFile, generateHandlerId, walkEventBlocks, type ImportEnvelope } from '../import-helpers.js'
import { createLogger } from '../../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'codex.ts' })

/**
 * OpenAI Codex CLI provider — reads `~/.codex/config.toml`.
 *
 * Config shape (relevant subset):
 *   [hooks]
 *   notify = "/path/to/notify.sh"
 *   inspect.prompt = "/path/to/prompt-inspect.sh"
 *   inspect.tool_call = "/path/to/tool-inspect.sh"
 *
 * Codex's hook entries are bare-string commands keyed by event name.
 * We map those to mcp-graph channels via `codexAliases`.
 */

export const codexAliases: Record<string, HookChannel | null> = {
  notify: 'task:post-complete',
  'inspect.prompt': 'task:pre-execute',
  'inspect.tool_call': 'tool:pre-call',
}

interface CodexConfig {
  hooks?: Record<string, string | { prompt?: string; tool_call?: string }>
}

export interface CodexImportOptions {
  source?: string
}

/** importCodexSettings —  */
export function importCodexSettings(opts: CodexImportOptions = {}): ImportEnvelope {
  const source = opts.source ?? join(homedir(), '.codex', 'config.toml')
  const file = readSettingsFile<CodexConfig>(source, 'toml')
  if (!file.ok) {
    return { imported: [], skipped: [{ event: '*', reason: file.reason }], source, provider: 'codex' }
  }

  // Codex flattens `inspect.prompt` and `inspect.tool_call` into a nested
  // table when read via TOML. Re-flatten for uniform handling.
  const flat = flattenHooks(file.data.hooks ?? {})
  const blocksByEvent: Record<string, Array<{ command: string }>> = {}
  for (const [event, command] of Object.entries(flat)) {
    if (typeof command === 'string' && command.length > 0) {
      blocksByEvent[event] = [{ command }]
    }
  }

  const envelope = walkEventBlocks<{ command: string }, { command: string }>(
    {
      provider: 'codex',
      aliases: codexAliases,
      blocksByEvent,
      blockHooks: (block) => [block],
      toHandler: (event, channel, _matcher, hook, blockIdx, hookIdx): HookHandlerConfig | { skip: string } => {
        if (!hook.command) return { skip: 'missing command' }
        return {
          id: generateHandlerId('codex', event, blockIdx, hookIdx),
          channel,
          kind: 'shell',
          command: '/bin/sh',
          commandArgs: ['-c', hook.command],
          timeoutMs: 5000,
          priority: 0,
          enabled: true,
          description: `Imported from Codex hook ${event}`,
          agentSource: 'codex',
        }
      },
    },
    source,
  )

  log.info('hooks:import:done', {
    provider: 'codex',
    source,
    imported: envelope.imported.length,
    skipped: envelope.skipped.length,
  })
  return envelope
}

function flattenHooks(hooks: CodexConfig['hooks']): Record<string, string> {
  const flat: Record<string, string> = {}
  for (const [key, value] of Object.entries(hooks ?? {})) {
    if (typeof value === 'string') flat[key] = value
    else if (value && typeof value === 'object') {
      for (const [subKey, subValue] of Object.entries(value)) {
        if (typeof subValue === 'string') flat[`${key}.${subKey}`] = subValue
      }
    }
  }
  return flat
}
