/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type Database from 'better-sqlite3'

export function hasKnowledgeEntry(db: Database.Database, nodeId: string): boolean {
  try {
    const row = db
      .prepare(
        `SELECT 1 FROM knowledge_documents
         WHERE source_id LIKE ?
         LIMIT 1`,
      )
      .get(`%${nodeId}%`) as { 1: number } | undefined
    return row !== undefined
  } catch {
    return false
  }
}
