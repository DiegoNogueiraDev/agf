/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveChannel, type ClaudeCodeEvent, CLAUDE_CODE_ALIASES } from './channel-aliases.js'
import type { HookHandlerConfig } from './config-loader.js'
import { readSettingsFile, generateHandlerId, walkEventBlocks, type ImportEnvelope } from './import-helpers.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'claude-code-importer.ts' })

/**
 * Read a Claude Code settings.json (or settings.local.json) and convert
 * its hook blocks into mcp-graph HookHandlerConfig entries (kind=shell).
 *
 * Refactored in Sprint M0 (Multi-CLI PRD) to use the shared
 * import-helpers primitives so adding new providers is ~30 LOC each.
 *
 * Settings shape (Claude Code):
 *   {
 *     "hooks": {
 *       "PreToolUse": [
 *         { "matcher": "Bash", "hooks": [{ "type": "command", "command": "..." }] }
 *       ]
 *     }
 *   }
 */

interface ClaudeHookEntry {
  type?: string
  command?: string
  timeout?: number
}

interface ClaudeHookBlock {
  matcher?: string
  hooks?: ClaudeHookEntry[]
}

interface ClaudeSettings {
  hooks?: Record<string, ClaudeHookBlock[]>
}

export type ImportResult = ImportEnvelope

export interface ImportOptions {
  /** Override default `~/.claude/settings.json` */
  source?: string
}

/** importClaudeCodeSettings —  */
export function importClaudeCodeSettings(options: ImportOptions = {}): ImportResult {
  const source = options.source ?? join(homedir(), '.claude', 'settings.json')
  const file = readSettingsFile<ClaudeSettings>(source, 'json')
  if (!file.ok) {
    return { imported: [], skipped: [{ event: '*', reason: file.reason }], source, provider: 'claude' }
  }

  const blocksByEvent = file.data.hooks ?? {}
  const aliasMap = CLAUDE_CODE_ALIASES as unknown as Record<string, ReturnType<typeof resolveChannel>>

  const envelope = walkEventBlocks<ClaudeHookBlock, ClaudeHookEntry>(
    {
      provider: 'claude',
      aliases: aliasMap,
      blocksByEvent,
      blockHooks: (block) => block.hooks ?? [],
      blockMatcher: (block) => block.matcher,
      toHandler: (event, channel, matcher, hook, blockIdx, hookIdx): HookHandlerConfig | { skip: string } => {
        if (hook.type !== 'command' || !hook.command) {
          return { skip: 'not a command hook' }
        }
        return {
          id: generateHandlerId('claude', event, blockIdx, hookIdx),
          channel,
          matcher: matcher ? `${channel}(toolName:${matcher})` : undefined,
          kind: 'shell',
          command: '/bin/sh',
          commandArgs: ['-c', hook.command],
          timeoutMs: hook.timeout ? hook.timeout * 1000 : 5000,
          priority: 0,
          enabled: true,
          description: `Imported from Claude Code event ${event as ClaudeCodeEvent}${matcher ? ` (matcher=${matcher})` : ''}`,
          agentSource: 'claude',
        }
      },
    },
    source,
  )

  log.info('hooks:import:done', {
    provider: 'claude',
    source,
    imported: envelope.imported.length,
    skipped: envelope.skipped.length,
  })
  return envelope
}
