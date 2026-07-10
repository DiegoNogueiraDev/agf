/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { readSettingsFile, type ImportEnvelope } from '../import-helpers.js'
import { createLogger } from '../../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'continue.ts' })

/**
 * Sprint M6 (Multi-CLI PRD, stretch) — Continue.dev provider.
 *
 * Continue has NO hook lifecycle. Its tool calls go through MCP, so
 * Sprint 1.2 wiring (unified-gate.ts → tool:pre-call/post-call) already
 * captures them. This provider:
 *  1. Reports MCP servers configured in ~/.continue/config.json so the
 *     user knows what's wired.
 *  2. Returns an empty handlers list with explicit reason.
 */

interface ContinueConfig {
  mcpServers?: Record<string, unknown>
}

export interface ContinueImportOptions {
  source?: string
}

export interface ContinueImportResult extends ImportEnvelope {
  mcpServers: string[]
}

/** importContinueSettings —  */
export function importContinueSettings(opts: ContinueImportOptions = {}): ContinueImportResult {
  const source = opts.source ?? join(homedir(), '.continue', 'config.json')
  const file = readSettingsFile<ContinueConfig>(source, 'json')
  const skipped: ImportEnvelope['skipped'] = [
    { event: '*', reason: 'Continue.dev has no hook lifecycle — tool calls covered via MCP path (Sprint 1.2)' },
  ]

  if (!file.ok) {
    return {
      imported: [],
      skipped: [{ event: '*', reason: file.reason }],
      source,
      provider: 'continue',
      mcpServers: [],
    }
  }

  const mcpServers = Object.keys(file.data.mcpServers ?? {})
  log.info('hooks:import:continue', { source, mcpServersCount: mcpServers.length })
  return {
    imported: [],
    skipped,
    source,
    provider: 'continue',
    mcpServers,
  }
}
