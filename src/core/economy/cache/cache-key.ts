/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { createHash } from 'node:crypto'

/** Recursively serializes a value with keys sorted — produces a stable JSON string. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    // Normalize `undefined` elements to `null`: JSON.stringify(undefined) returns
    // the JS value `undefined`, which join(',') coerces to '' — collapsing [] and
    // [undefined] to the same string (AUDIT-047). `null` keeps them distinct.
    return '[' + value.map((el) => (el === undefined ? 'null' : canonicalJson(el))).join(',') + ']'
  }
  const sorted = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
    .join(',')
  return '{' + sorted + '}'
}

export interface CacheKeyInput {
  toolName: string
  args: unknown
  schemaVersion: number
  model?: string
}

/** Returns a 64-char hex SHA-256 of the canonical inputs. */
export function buildCacheKey(input: CacheKeyInput): string {
  const { toolName, args, schemaVersion, model } = input
  const payload = canonicalJson({ toolName, args, schemaVersion, model: model ?? null })
  return createHash('sha256').update(payload).digest('hex')
}
