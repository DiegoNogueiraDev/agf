/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §Task 3.5 subtask -- GraphQL SDL parser: extracts type/input/enum/interface definitions.
 * Deterministic — pure regex over raw text, zero LLM calls.
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'read-graphql.ts' })

export type GraphqlKind =
  'type' | 'input' | 'enum' | 'interface' | 'scalar' | 'union' | 'query' | 'mutation' | 'subscription' | 'fragment'

export interface GraphqlEntry {
  kind: GraphqlKind
  name: string
}

export interface ParsedGraphql {
  entries: GraphqlEntry[]
  raw: string
}

const DEFINITION_RE = /^(type|input|enum|interface|scalar|union|query|mutation|subscription|fragment)\s+(\w+)/

/** Parse a GraphQL SDL string and extract top-level definitions (best-effort). */
export function parseGraphql(content: string): ParsedGraphql {
  if (!content.trim()) return { entries: [], raw: content }

  const entries: GraphqlEntry[] = []

  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    const match = DEFINITION_RE.exec(line)
    if (match) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §pre-existing: DEFINITION_RE groups 1 and 2 are required capture groups
      entries.push({ kind: match[1] as GraphqlKind, name: match[2]! })
    }
  }

  log.debug('read-graphql:parsed', { entriesCount: entries.length })
  return { entries, raw: content }
}
