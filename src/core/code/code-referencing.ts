/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * findReferencingSymbols — locate every call-site / import of a named symbol.
 * Mirrors the Serena API contract: findReferencingSymbols(symbolName, scope).
 * Operates entirely on indexed SQLite data — no LLM, no file I/O.
 */

import type { CodeStore } from './code-store.js'
import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'code/code-referencing.ts' })

export interface SymbolReference {
  file: string
  line: number
  snippet: string
}

/**
 * Return all indexed call-sites / usages of `symbolName` in `projectId`.
 *
 * @param scope - restrict results to a specific file path, or omit / pass
 *   "project" for project-wide results.
 */
export function findReferencingSymbols(
  store: CodeStore,
  symbolName: string,
  projectId: string,
  scope?: string,
): SymbolReference[] {
  const targets = store.findSymbolsByName(symbolName, projectId)
  if (targets.length === 0) return []

  const toIds = targets.map((s) => s.id)
  const effectiveScope = scope === 'project' ? undefined : scope
  const rows = store.getReferencingRows(toIds, projectId, effectiveScope)

  return rows.map((row) => ({
    file: row.ref_file,
    line: row.ref_line,
    snippet: row.snippet ?? '',
  }))
}
