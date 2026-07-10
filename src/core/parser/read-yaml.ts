/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §Task 3.5 subtask -- YAML parser: extracts top-level keys with type metadata.
 * Uses the `yaml` package already present in the project.
 */

import YAML from 'yaml'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'read-yaml.ts' })

export interface YamlEntry {
  key: string
  valueType: string
  hasChildren: boolean
}

export interface ParsedYaml {
  entries: YamlEntry[]
  raw: string
}

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function hasChildren(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  return typeof value === 'object'
}

/** Parse YAML content and extract top-level key structure (best-effort). */
export function parseYaml(content: string): ParsedYaml {
  if (!content.trim()) return { entries: [], raw: content }

  let parsed: unknown
  try {
    parsed = YAML.parse(content)
  } catch {
    return { entries: [], raw: content }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { entries: [], raw: content }
  }

  const entries: YamlEntry[] = Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({
    key,
    valueType: typeOf(value),
    hasChildren: hasChildren(value),
  }))

  log.debug('read-yaml:parsed', { entriesCount: entries.length })
  return { entries, raw: content }
}
