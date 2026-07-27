/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Canonical Node Hasher — the cheapest, fully-local leg of the provenance tier.
 *
 * Produces a deterministic SHA-256 digest of any JSON-serializable value by:
 *   1. recursively sorting object keys,
 *   2. trimming leading/trailing whitespace in string values,
 *   3. emitting whitespace-free JSON with no indentation.
 *
 * Two values that differ only in key order or surrounding whitespace hash to the
 * same digest; any semantic change (added/removed key, flipped char, array
 * reordering) produces a different digest.
 *
 * This is the offline receipt that lets a node reach the `proven` tier without
 * any network/OTS dependency — keeping the local-first promise intact (the OTS
 * calendar path from graph-flow is intentionally NOT ported: it needs a server).
 * Ported from graph-flow/core/provenance/canonical-hasher.ts.
 */

import { createHash } from 'node:crypto'

/** Deterministic, canonical string form of a JSON-serializable value. */
export function canonicalSerialize(value: unknown): string {
  return serialize(value)
}

/** SHA-256 hex digest of the canonical form — a deterministic local receipt. */
export function hashNodeCanonical(value: unknown): string {
  const canonical = serialize(value)
  return createHash('sha256').update(canonical).digest('hex')
}

function serialize(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value)
  if (typeof value === 'string') return JSON.stringify(value.trim())
  if (Array.isArray(value)) return `[${value.map(serialize).join(',')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    const body = entries.map(([k, v]) => `${JSON.stringify(k)}:${serialize(v)}`).join(',')
    return `{${body}}`
  }
  // undefined, functions, symbols — collapsed to null for determinism
  return 'null'
}
