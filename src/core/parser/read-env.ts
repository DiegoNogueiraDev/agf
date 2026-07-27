/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §Task 3.5 subtask -- .env parser: extracts key/value pairs with secret detection.
 * Deterministic — pure regex over raw text, zero LLM calls.
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'read-env.ts' })

export interface EnvEntry {
  key: string
  value: string
  hasValue: boolean
  isSecret: boolean
}

export interface ParsedEnv {
  entries: EnvEntry[]
  raw: string
}

const SECRET_PATTERNS = /SECRET|KEY|TOKEN|PASSWORD|PASS|PWD|CERT|PRIVATE/i

function isSecret(key: string): boolean {
  return SECRET_PATTERNS.test(key)
}

/** Parse a .env or .env.example file content (best-effort). */
export function parseEnv(content: string): ParsedEnv {
  if (!content.trim()) return { entries: [], raw: content }

  const entries: EnvEntry[] = []

  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    const eqIdx = line.indexOf('=')
    if (eqIdx === -1) continue

    const key = line.slice(0, eqIdx).trim()
    if (!key) continue

    const value = line.slice(eqIdx + 1).trim()
    const hasValue = value.length > 0

    entries.push({ key, value, hasValue, isSecret: isSecret(key) })
  }

  log.debug('read-env:parsed', { entriesCount: entries.length })
  return { entries, raw: content }
}
