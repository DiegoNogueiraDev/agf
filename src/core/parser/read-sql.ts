/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §Task 3.5 subtask -- SQL DDL parser: extracts CREATE TABLE, indexes, and FOREIGN KEY constraints.
 * Deterministic — pure regex over raw text, zero LLM calls, no new dependencies.
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'read-sql.ts' })

export type SqlKind = 'table' | 'index' | 'foreign_key'

export interface SqlEntry {
  kind: SqlKind
  name: string
  ref: string
}

export interface ParsedSql {
  entries: SqlEntry[]
  raw: string
}

const CREATE_TABLE_RE = /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?([\w]+)["'`]?/i
const CREATE_INDEX_RE = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?([\w]+)["'`]?/i
const FOREIGN_KEY_RE = /FOREIGN\s+KEY\s*\([^)]+\)\s*REFERENCES\s+["'`]?([\w]+)["'`]?/i

/** Parse SQL DDL content and extract CREATE TABLE, index, and FK definitions (best-effort). */
export function parseSql(content: string): ParsedSql {
  if (!content.trim()) return { entries: [], raw: content }

  const entries: SqlEntry[] = []

  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('--')) continue

    const tableMatch = CREATE_TABLE_RE.exec(line)
    if (tableMatch) {
      const name = tableMatch[1] ?? ''
      if (name) entries.push({ kind: 'table', name, ref: '' })
    } else {
      const indexMatch = CREATE_INDEX_RE.exec(line)
      if (indexMatch) {
        const name = indexMatch[1] ?? ''
        if (name) entries.push({ kind: 'index', name, ref: '' })
      }
    }

    const fkMatch = FOREIGN_KEY_RE.exec(line)
    if (fkMatch) {
      const ref = fkMatch[1] ?? ''
      if (ref) entries.push({ kind: 'foreign_key', name: '', ref })
    }
  }

  log.debug('read-sql:parsed', { entriesCount: entries.length })
  return { entries, raw: content }
}
