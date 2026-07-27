/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Cross-Project Learning — imports knowledge from another project's database.
 * Reuses existing exportKnowledge/importKnowledge from knowledge-packager.ts.
 */

import type Database from 'better-sqlite3'
import { createDatabase } from '../store/database-factory.js'
import { exportKnowledge, importKnowledge } from './knowledge-packager.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'cross-project-learner.ts' })

export interface LearnOptions {
  categories?: string[]
  minQuality?: number
  maxDocs?: number
}

export interface LearnResult {
  imported: number
  skipped: number
  categories: Record<string, number>
  sourceProject: string
}

const CATEGORY_TO_SOURCE_TYPE: Record<string, string[]> = {
  errors: ['ai_decision', 'validation_result', 'test_outcome'],
  estimates: ['sprint_plan', 'phase_summary'],
  adrs: ['ai_decision', 'design'],
  templates: ['skill', 'prd'],
  patterns: ['memory', 'synthesis', 'ai_decision'],
}

/**
 * Learn from another project's knowledge store.
 * Opens source DB read-only, exports matching knowledge, imports into target.
 */
export async function learnFromProject(
  targetDb: Database.Database,
  targetBasePath: string,
  sourcePath: string,
  options?: LearnOptions,
): Promise<LearnResult> {
  const { categories, minQuality = 0.4, maxDocs = 100 } = options ?? {}

  let sourceDb: Database.Database
  try {
    sourceDb = createDatabase(sourcePath, { readonly: true })
  } catch (err) {
    log.warn('cross-project:open_failed', { sourcePath, error: String(err) })
    return { imported: 0, skipped: 0, categories: {}, sourceProject: sourcePath }
  }

  try {
    // Determine source types to export
    const sourceTypes = categories ? categories.flatMap((c) => CATEGORY_TO_SOURCE_TYPE[c] ?? []) : undefined

    // Export from source
    const { package: pkg } = await exportKnowledge(sourceDb, sourcePath, {
      sources: sourceTypes,
      minQuality,
      includeMemories: true,
      includeRelations: false,
      includeTranslationMemory: false,
    })

    // Limit docs
    if (maxDocs && pkg.documents.length > maxDocs) {
      pkg.documents = pkg.documents.sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0)).slice(0, maxDocs)
    }

    // Import into target
    const resultValue = await importKnowledge(targetDb, targetBasePath, pkg)

    // Count by category
    const catCounts: Record<string, number> = {}
    for (const doc of pkg.documents) {
      const cat = doc.sourceType ?? 'unknown'
      catCounts[cat] = (catCounts[cat] ?? 0) + 1
    }

    log.info('cross-project:learned', {
      sourcePath,
      imported: resultValue.documentsImported,
      skipped: resultValue.documentsSkipped,
      categories: Object.keys(catCounts).length,
    })

    return {
      imported: resultValue.documentsImported,
      skipped: resultValue.documentsSkipped,
      categories: catCounts,
      sourceProject: sourcePath,
    }
  } catch (err) {
    log.warn('cross-project:learn_failed', { sourcePath, error: String(err) })
    return { imported: 0, skipped: 0, categories: {}, sourceProject: sourcePath }
  } finally {
    try {
      sourceDb.close()
    } catch (err) {
      log.debug('intentional-swallow', { error: String(err), reason: 'best-effort db close' })
    }
  }
}
