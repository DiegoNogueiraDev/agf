/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ImportEnvelope } from '../import-helpers.js'
import { createLogger } from '../../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'cline.ts' })

/**
 * Sprint M6 (Multi-CLI PRD, stretch) — Cline (VS Code extension).
 *
 * Cline has NO hook lifecycle. Same pattern as Continue: MCP path
 * already covers tool calls. This provider reports MCP servers configured
 * in the VS Code user settings (cline section) so the user knows what's
 * wired.
 *
 * Default config locations (per platform):
 *  - macOS:    ~/Library/Application Support/Code/User/settings.json
 *  - Linux:    ~/.config/Code/User/settings.json
 *  - Windows:  %APPDATA%\Code\User\settings.json
 *
 * Caller may pass `source` directly. Auto-resolution best-effort.
 */

export interface ClineImportOptions {
  source?: string
}

export interface ClineImportResult extends ImportEnvelope {
  mcpServers: string[]
}

/** importClineSettings —  */
export function importClineSettings(opts: ClineImportOptions = {}): ClineImportResult {
  const source = opts.source ?? defaultVsCodeSettingsPath()
  const skipReason = 'Cline has no hook lifecycle — tool calls covered via MCP path (Sprint 1.2)'

  if (!existsSync(source)) {
    return {
      imported: [],
      skipped: [{ event: '*', reason: `source not found: ${source}` }],
      source,
      provider: 'cline',
      mcpServers: [],
    }
  }

  let raw: string
  try {
    raw = readFileSync(source, 'utf-8')
  } catch (err) {
    return {
      imported: [],
      skipped: [{ event: '*', reason: `read error: ${String(err)}` }],
      source,
      provider: 'cline',
      mcpServers: [],
    }
  }

  // VS Code settings.json allows trailing commas + comments → strip lightly
  // before JSON.parse. Caller is on the hook for malformed comments edge
  // cases; we accept minimal subset.
  const stripped = raw.replace(/\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1')
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(stripped) as Record<string, unknown>
  } catch (err) {
    return {
      imported: [],
      skipped: [{ event: '*', reason: `parse error: ${String(err)}` }],
      source,
      provider: 'cline',
      mcpServers: [],
    }
  }

  const clineMcp = parsed['cline.mcpServers'] as Record<string, unknown> | undefined
  const mcpServers = clineMcp ? Object.keys(clineMcp) : []
  log.info('hooks:import:cline', { source, mcpServersCount: mcpServers.length })

  return {
    imported: [],
    skipped: [{ event: '*', reason: skipReason }],
    source,
    provider: 'cline',
    mcpServers,
  }
}

function defaultVsCodeSettingsPath(): string {
  const home = homedir()
  if (process.platform === 'darwin')
    return join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json')
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
    return join(appData, 'Code', 'User', 'settings.json')
  }
  return join(home, '.config', 'Code', 'User', 'settings.json')
}
