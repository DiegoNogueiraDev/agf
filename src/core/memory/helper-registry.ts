/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Helper Registry — persists and discovers agent-generated reusable helpers.
 * Built on top of the existing memory-reader (writeMemory/readMemory) so helpers
 * live in workflow-graph/memories/helpers/<key>.md alongside other project memories.
 *
 * WHY: tasks that derive a useful fragment (a runbook step, a code snippet,
 * a decision heuristic) can persist it here; the next run discovers and reuses
 * it without re-deriving (economy). Idempotent: same key + same content = no-op.
 *
 * Composing: memory-reader.ts (write/read) → helpers live in memories/helpers/<key>
 */

import { writeMemory, readMemory } from './memory-reader.js'

const HELPER_PREFIX = 'helpers'

export interface HelperMeta {
  key: string
  content: string
}

export interface PersistResult {
  /** true = written (new or updated); false = skipped (identical content already exists) */
  persisted: boolean
}

/**
 * Persist a helper fragment under a stable key.
 * Idempotent: if the key already contains byte-identical content, skip the write.
 * Returns `{persisted: false}` on skip, `{persisted: true}` on write.
 */
export async function persistHelper(basePath: string, key: string, content: string): Promise<PersistResult> {
  const memName = `${HELPER_PREFIX}/${key}`
  const existing = await readMemory(basePath, memName)
  if (existing !== null && existing.content === content) {
    return { persisted: false }
  }
  await writeMemory(basePath, memName, content)
  return { persisted: true }
}

/**
 * Discover a previously persisted helper by key.
 * Returns null if no helper exists under that key.
 */
export async function discoverHelper(basePath: string, key: string): Promise<HelperMeta | null> {
  const memName = `${HELPER_PREFIX}/${key}`
  const mem = await readMemory(basePath, memName)
  if (mem === null) return null
  return { key, content: mem.content }
}
