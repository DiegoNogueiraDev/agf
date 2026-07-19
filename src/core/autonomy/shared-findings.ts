/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * B5 — Shared findings store: an in-memory, content-hash-deduped record of what
 * parallel agents have discovered. Lets siblings skip work a peer already did.
 * Dedup is by sha256 of the content (same hashing precedent as ccr-store.ts).
 */

import { createHash } from 'node:crypto'

export interface Finding {
  /** Deterministic sha256 hex digest of `content` (the dedup key). */
  key: string
  content: string
}

export interface SharedFindings {
  /** Record a finding. Returns false if an identical content was already present. */
  add(content: string): boolean
  /** True when an identical content has already been recorded. */
  has(content: string): boolean
  /** All distinct findings recorded so far, in insertion order. */
  all(): Finding[]
}

/** Deterministic sha256 hex digest of a string (utf8-encoded). */
function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/** Create an empty, in-memory shared-findings store. */
export function createSharedFindings(): SharedFindings {
  const byKey = new Map<string, Finding>()

  return {
    add(content: string): boolean {
      const key = hashContent(content)
      if (byKey.has(key)) return false
      byKey.set(key, { key, content })
      return true
    },
    has(content: string): boolean {
      return byKey.has(hashContent(content))
    },
    all(): Finding[] {
      return [...byKey.values()]
    },
  }
}
