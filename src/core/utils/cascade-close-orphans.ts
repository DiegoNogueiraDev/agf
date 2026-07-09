/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * cascade-close-orphans — a task can sit in backlog long after its work was
 * actually implemented under a sibling/parent node closed earlier — only
 * discovered via manual preflight/grep in this session, repeatedly. This
 * flags backlog children whose AC has high textual overlap with their
 * just-closed parent's AC — a WARNING only, never an auto-close (the human
 * verifies and closes manually via `agf node status <id> done`).
 *
 * Reuses ac-testability.ts's tokenize/cosineSimilarity — the exact technique
 * scoreAcTestabilityBatch already uses for AC-redundancy detection — rather
 * than inventing new similarity logic. Distinct from epic-promotion.ts's
 * cascadeDownOnDone (which unconditionally closes acceptance_criteria/
 * subtask children by TYPE, no similarity check) — this targets task-type
 * children based on CONTENT overlap, and only ever warns.
 */
import type { SqliteStore } from '../store/sqlite-store.js'
import { getNodeAcFromStore } from './ac-helpers.js'
import { tokenize, cosineSimilarity } from '../analyzer/ac-testability.js'

/** Cosine-similarity floor above which a child is flagged — matches scoreAcTestabilityBatch's redundancy threshold. */
const SIMILARITY_THRESHOLD = 0.7

export interface OrphanCandidate {
  nodeId: string
  title: string
  similarity: number
}

/**
 * Find backlog task-type children of `parentId` whose AC has high textual
 * overlap with the just-closed parent's AC — likely already implemented as
 * part of the parent's delivery.
 */
export function findPotentiallySatisfiedChildren(store: SqliteStore, parentId: string): OrphanCandidate[] {
  const parent = store.getNodeById(parentId)
  if (!parent) return []

  const parentDeclared = [...(parent.testFiles ?? []), ...(parent.implementationFiles ?? [])]
  const parentAc = getNodeAcFromStore(store, parentId)
  if (parentDeclared.length === 0 || parentAc.length === 0) return []

  const parentTokens = tokenize(parentAc.join(' '))
  if (parentTokens.length === 0) return []

  const candidates: OrphanCandidate[] = []
  for (const child of store.getChildNodes(parentId)) {
    if (child.type !== 'task' || child.status === 'done') continue

    const childAc = getNodeAcFromStore(store, child.id)
    if (childAc.length === 0) continue

    const similarity = cosineSimilarity(tokenize(childAc.join(' ')), parentTokens)
    if (similarity >= SIMILARITY_THRESHOLD) {
      candidates.push({ nodeId: child.id, title: child.title, similarity })
    }
  }

  return candidates
}
