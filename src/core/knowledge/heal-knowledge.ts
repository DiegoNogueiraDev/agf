/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { Database } from 'better-sqlite3'

const MIN_CONTENT_LENGTH = 20
const STALE_DAYS = 90

export interface HealKnowledgeResult {
  removed: number
  kept: number
  savedTokens: number
  contaminated: string[]
}

interface DocRow {
  id: string
  content: string
  created_at: string
  last_accessed_at: string | null
}

function isInvalid(doc: DocRow): boolean {
  return doc.content.length < MIN_CONTENT_LENGTH
}

function isStale(doc: DocRow): boolean {
  const refDate = doc.last_accessed_at ?? doc.created_at
  const ageMs = Date.now() - new Date(refDate).getTime()
  const ageDays = ageMs / (24 * 60 * 60 * 1000)
  return ageDays > STALE_DAYS
}

export function healKnowledge(db: Database, opts: { dryRun: boolean }): HealKnowledgeResult {
  let rows: DocRow[]
  try {
    rows = db.prepare('SELECT id, content, created_at, last_accessed_at FROM knowledge_documents').all() as DocRow[]
  } catch {
    return { removed: 0, kept: 0, savedTokens: 0, contaminated: [] }
  }

  const toRemove: DocRow[] = []
  for (const row of rows) {
    if (isInvalid(row) || isStale(row)) toRemove.push(row)
  }

  const contaminated = toRemove.map((r) => r.id)

  if (opts.dryRun) {
    return { removed: 0, kept: rows.length, savedTokens: 0, contaminated }
  }

  let removedChars = 0
  if (toRemove.length > 0) {
    const placeholders = toRemove.map(() => '?').join(',')
    db.prepare(`DELETE FROM knowledge_documents WHERE id IN (${placeholders})`).run(...toRemove.map((r) => r.id))
    removedChars = toRemove.reduce((sum, r) => sum + r.content.length, 0)
  }

  return {
    removed: toRemove.length,
    kept: rows.length - toRemove.length,
    savedTokens: Math.ceil(removedChars / 4),
    contaminated,
  }
}
