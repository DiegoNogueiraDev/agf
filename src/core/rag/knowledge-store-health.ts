/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §E2.1 — Knowledge store RAG health scoring.
 * Zero-LLM. Pure function over the knowledge_documents table.
 */

import type Database from 'better-sqlite3'
import type { HealthGrade } from '../colony/colony-signals.js'

export interface KnowledgeStoreHealth {
  score: number
  grade: HealthGrade
  total_docs: number
  valid_docs: number
  stale_docs: number
}

export function gradeKnowledgeStore(score: number): HealthGrade {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

const STALE_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000
const MIN_CONTENT_LENGTH = 50

export function scoreKnowledgeStore(db: Database.Database): KnowledgeStoreHealth {
  let total_docs = 0
  let valid_docs = 0
  let stale_docs = 0

  try {
    const rows = db.prepare('SELECT content, content_hash, updated_at FROM knowledge_documents').all() as Array<{
      content: string
      content_hash: string
      updated_at: string
    }>

    total_docs = rows.length
    const cutoff = Date.now() - STALE_THRESHOLD_MS

    for (const row of rows) {
      const isValid = row.content_hash.length > 0 && row.content.length >= MIN_CONTENT_LENGTH
      if (isValid) valid_docs++

      const updatedMs = new Date(row.updated_at).getTime()
      if (!isNaN(updatedMs) && updatedMs < cutoff) stale_docs++
    }
  } catch {
    /* table may not exist in this DB version */
  }

  const score = total_docs === 0 ? 0 : Math.round((valid_docs / total_docs) * 100)

  return { score, grade: gradeKnowledgeStore(score), total_docs, valid_docs, stale_docs }
}
