/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, sep } from 'node:path'
import type { HookChannel } from '../hook-types.js'
import type { HookHandlerConfig } from '../config-loader.js'
import { readSettingsFile, generateHandlerId, walkEventBlocks, type ImportEnvelope } from '../import-helpers.js'
import { createLogger } from '../../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'opencode.ts' })

/**
 * OpenCode (SST) provider — reads `~/.config/opencode/config.toml`
 * and `<repo>/.opencode/config.toml`.
 *
 * Config shape (relevant subset):
 *   [hooks]
 *   pre-tool = "/path/to/script"
 *   post-tool = "/path/to/script"
 *   session.start = "/path/to/script"
 *   session.end = "/path/to/script"
 *
 * Plugins live as TS files under `.opencode/plugins/` (project) or
 * `~/.config/opencode/plugins/` (user). v1 only DISCOVERS them
 * (returns paths) — does not execute or import. Future kind=opencode-plugin
 * may register them; for now they're advisory.
 */

export const opencodeAliases: Record<string, HookChannel | null> = {
  'pre-tool': 'tool:pre-call',
  'post-tool': 'tool:post-call',
  'session.start': 'session:start',
  'session.end': 'session:end',
}

interface OpenCodeConfig {
  hooks?: Record<string, string | { start?: string; end?: string }>
}

export interface OpenCodeImportOptions {
  source?: string
  /** Override default plugin scan dirs (testing). */
  pluginDirs?: string[]
}

export interface OpenCodeImportResult extends ImportEnvelope {
  pluginsDiscovered: string[]
}

/** importOpenCodeSettings —  */
export function importOpenCodeSettings(opts: OpenCodeImportOptions = {}): OpenCodeImportResult {
  const source = opts.source ?? defaultUserConfig()
  const file = readSettingsFile<OpenCodeConfig>(source, 'toml')
  const pluginsDiscovered = scanPlugins(opts.pluginDirs ?? defaultPluginDirs())

  if (!file.ok) {
    return {
      imported: [],
      skipped: [{ event: '*', reason: file.reason }],
      source,
      provider: 'opencode',
      pluginsDiscovered,
    }
  }

  const flat = flattenHooks(file.data.hooks ?? {})
  const blocksByEvent: Record<string, Array<{ command: string }>> = {}
  for (const [event, command] of Object.entries(flat)) {
    if (typeof command === 'string' && command.length > 0) {
      blocksByEvent[event] = [{ command }]
    }
  }

  const envelope = walkEventBlocks<{ command: string }, { command: string }>(
    {
      provider: 'opencode',
      aliases: opencodeAliases,
      blocksByEvent,
      blockHooks: (block) => [block],
      toHandler: (event, channel, _matcher, hook, blockIdx, hookIdx): HookHandlerConfig | { skip: string } => {
        if (!hook.command) return { skip: 'missing command' }
        return {
          id: generateHandlerId('opencode', event, blockIdx, hookIdx),
          channel,
          kind: 'shell',
          command: '/bin/sh',
          commandArgs: ['-c', hook.command],
          timeoutMs: 5000,
          priority: 0,
          enabled: true,
          description: `Imported from OpenCode hook ${event}`,
          agentSource: 'opencode',
        }
      },
    },
    source,
  )

  log.info('hooks:import:done', {
    provider: 'opencode',
    source,
    imported: envelope.imported.length,
    skipped: envelope.skipped.length,
    pluginsDiscovered: pluginsDiscovered.length,
  })
  return { ...envelope, pluginsDiscovered }
}

function defaultUserConfig(): string {
  return join(homedir(), '.config', 'opencode', 'config.toml')
}

function defaultPluginDirs(): string[] {
  return [join(homedir(), '.config', 'opencode', 'plugins'), join(process.cwd(), '.opencode', 'plugins')]
}

function scanPlugins(dirs: string[]): string[] {
  const found: string[] = []
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.endsWith('.ts') || entry.endsWith('.js') || entry.endsWith('.mjs')) {
          found.push(`${dir}${sep}${entry}`)
        }
      }
    } catch (err) {
      log.warn('opencode:plugins:scan_failed', { dir, error: String(err) })
    }
  }
  return found
}

function flattenHooks(hooks: OpenCodeConfig['hooks']): Record<string, string> {
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
