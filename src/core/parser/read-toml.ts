/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §Task 3.5 subtask -- TOML parser: extracts top-level keys and section headers.
 * Deterministic — pure regex over raw text, zero LLM calls, no new dependencies.
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'read-toml.ts' })

export interface TomlEntry {
  key: string
  valueType: string
  hasChildren: boolean
}

export interface ParsedToml {
  entries: TomlEntry[]
  raw: string
}

const ARRAY_TABLE_RE = /^\[\[([\w.]+)\]\]/
const TABLE_RE = /^\[([\w.]+)\]/
const KEY_VALUE_RE = /^([\w.]+)\s*=\s*(.+)/

function inferType(value: string): string {
  const v = value.trim()
  if (v.startsWith('"') || v.startsWith("'")) return 'string'
  if (v === 'true' || v === 'false') return 'boolean'
  if (v.startsWith('[')) return 'array'
  if (v.startsWith('{')) return 'inline_table'
  if (/^-?[0-9]+(?:[.][0-9]+)?$/.test(v)) return 'number'
  return 'string'
}

function topKey(dotted: string | undefined): string {
  return dotted?.split('.')[0] ?? ''
}

/** Parse TOML content and extract top-level keys + section headers (best-effort). */
export function parseToml(content: string): ParsedToml {
  if (!content.trim()) return { entries: [], raw: content }

  const entries: TomlEntry[] = []
  const seen = new Set<string>()

  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    let m = ARRAY_TABLE_RE.exec(line)
    if (m) {
      const key = topKey(m[1])
      if (key && !seen.has(key)) {
        seen.add(key)
        entries.push({ key, valueType: 'array', hasChildren: true })
      }
      continue
    }

    m = TABLE_RE.exec(line)
    if (m) {
      const key = topKey(m[1])
      if (key && !seen.has(key)) {
        seen.add(key)
        entries.push({ key, valueType: 'table', hasChildren: true })
      }
      continue
    }

    m = KEY_VALUE_RE.exec(line)
    if (m) {
      const key = topKey(m[1])
      const val = m[2] ?? ''
      if (key && !seen.has(key)) {
        seen.add(key)
        entries.push({ key, valueType: inferType(val), hasChildren: false })
      }
    }
  }

  log.debug('read-toml:parsed', { entriesCount: entries.length })
  return { entries, raw: content }
}
