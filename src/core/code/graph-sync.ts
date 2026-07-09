/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Code-Aware Graph Sync — detects drift between graph nodes and code index.
 * Validates sourceRefs, testFiles, and suggests fixes.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'graph-sync.ts' })

export interface SyncReport {
  staleRefs: string[]
  autoFilledTestFiles: string[]
  symbolChanges: string[]
  suggestions: string[]
}

/**
 * Sync graph nodes with code index state.
 * Reports stale sourceRefs, missing testFiles, and drift.
 */
/** Normalize file paths: strip leading ./ and normalize separators */
function normalizePath(p: string): string {
  return p.replace(/^\.\//, '').replace(/\\/g, '/')
}

/** syncGraphFromCode —  */
export function syncGraphFromCode(store: SqliteStore): SyncReport {
  const staleRefs: string[] = []
  const autoFilledTestFiles: string[] = []
  const symbolChanges: string[] = []
  const suggestions: string[] = []

  const db = store.getDb()
  const project = store.getProject()
  if (!project) return { staleRefs, autoFilledTestFiles, symbolChanges, suggestions }

  const doc = store.toGraphDocument()

  // Check if code index exists
  let hasCodeIndex = false
  try {
    const meta = db.prepare('SELECT symbol_count FROM code_index_meta WHERE project_id = ?').get(project.id) as
      { symbol_count: number } | undefined
    hasCodeIndex = (meta?.symbol_count ?? 0) > 0
  } catch (err) {
    log.debug('intentional-swallow', { error: String(err), reason: 'code_index_meta table may not exist' })
  }

  // Get indexed files set (for fast lookup)
  const indexedFiles = new Set<string>()
  if (hasCodeIndex) {
    try {
      const files = db.prepare('SELECT DISTINCT file FROM code_symbols WHERE project_id = ?').all(project.id) as {
        file: string
      }[]
      for (const fVar of files) indexedFiles.add(normalizePath(fVar.file))
    } catch (err) {
      log.debug('intentional-swallow', { error: String(err), reason: 'code_symbols table may not exist' })
    }
  }

  for (const node of doc.nodes) {
    // 1. Check stale sourceRefs
    if (node.sourceRef?.file && hasCodeIndex) {
      if (!indexedFiles.has(normalizePath(node.sourceRef.file))) {
        staleRefs.push(`${node.id} (${node.title}): sourceRef "${node.sourceRef.file}" not found in code index`)
      }
    }

    // 2. Suggest testFiles for done tasks without them
    if (node.status === 'done' && (node.type === 'task' || node.type === 'subtask')) {
      if (!node.testFiles || node.testFiles.length === 0) {
        suggestions.push(
          `${node.id} (${node.title}): done task without testFiles — consider adding test file references`,
        )
      }
    }

    // 3. Check testFiles existence in code index
    if (node.testFiles && node.testFiles.length > 0 && hasCodeIndex) {
      for (const tf of node.testFiles) {
        if (!indexedFiles.has(normalizePath(tf))) {
          suggestions.push(`${node.id}: testFile "${tf}" not found in code index (may be unindexed or deleted)`)
        }
      }
    }
  }

  // 4. Detect symbol changes since last sync (via git hash comparison)
  if (hasCodeIndex) {
    try {
      const meta = db
        .prepare('SELECT git_hash, last_indexed FROM code_index_meta WHERE project_id = ?')
        .get(project.id) as { git_hash: string | null; last_indexed: string } | undefined
      if (meta?.git_hash) {
        symbolChanges.push(`Code index at git hash: ${meta.git_hash} (indexed: ${meta.last_indexed})`)
      }
    } catch (err) {
      log.debug('intentional-swallow', { error: String(err), reason: 'best-effort git hash check' })
    }
  }

  log.info('graph-sync:completed', {
    staleRefs: staleRefs.length,
    autoFilled: autoFilledTestFiles.length,
    symbolChanges: symbolChanges.length,
    suggestions: suggestions.length,
  })

  return { staleRefs, autoFilledTestFiles, symbolChanges, suggestions }
}
