/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from '../../utils/logger.js'
import type { AgentSource } from '../config-loader.js'
import type { HookDedupStore } from '../dedup-store.js'
import { installFsWatcher } from '../fs-watcher.js'

const log = createLogger({ layer: 'core', source: 'cursor.ts' })

/**
 * Sprint M4 (Multi-CLI PRD) — Cursor provider.
 *
 * Cursor has no native lifecycle hooks. Two integration vectors:
 *  1. `.cursor/rules` is priming text — we surface it as a memory
 *     namespace so it shows up in RAG searches alongside the user's
 *     other memories.
 *  2. fs-watcher with inferAgentSource → 'cursor' attributes file
 *     changes to Cursor when no MCP tool fired (heuristic, brittle in
 *     multi-agent scenarios — documented as caveat).
 */

export interface CursorImportOptions {
  source?: string
}

export interface CursorImportResult {
  rulesText: string | null
  source: string
  provider: AgentSource
  imported: 0 | 1
}

/**
 * Read .cursor/rules content. Returns null if not present.
 * Caller (test or boot wiring) is responsible for persisting it as
 * memory via KnowledgeStore.insert if desired — keeps this module
 * pure.
 */
export function importCursorRules(opts: CursorImportOptions = {}): CursorImportResult {
  const source = opts.source ?? join(process.cwd(), '.cursor', 'rules')
  if (!existsSync(source)) {
    return { rulesText: null, source, provider: 'cursor', imported: 0 }
  }
  try {
    const rulesText = readFileSync(source, 'utf-8')
    log.info('hooks:cursor:rules_loaded', { source, bytes: rulesText.length })
    return { rulesText, source, provider: 'cursor', imported: 1 }
  } catch (err) {
    log.warn('hooks:cursor:rules_read_failed', { source, error: String(err) })
    return { rulesText: null, source, provider: 'cursor', imported: 0 }
  }
}

export interface CursorBridgeOptions {
  basePath: string
  dedupStore?: HookDedupStore
}

/**
 * Install fs-watcher with agentSource inferred to 'cursor'. Suitable
 * when the user runs Cursor as their primary IDE-side agent and wants
 * its file changes attributed correctly. Returns dispose function.
 */
export function installCursorBridge(opts: CursorBridgeOptions): () => void {
  return installFsWatcher({
    basePath: opts.basePath,
    dedupStore: opts.dedupStore,
    inferAgentSource: () => 'cursor',
  })
}
