/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Spec Sync Engine — bidirectional sync between spec documents and graph nodes.
 * ADR-09: v1 uses manual sync with drift detection, not auto-sync.
 */

import { createHash } from 'crypto'
import { createLogger } from '../utils/logger.js'
import type { SpecStore } from './spec-store.js'

const log = createLogger({ layer: 'core', source: 'sync-engine.ts' })

export interface SpecImpact {
  specId: string
  sectionTitle: string | null
  nodeId: string
  linkType: string
}

export interface SyncResult {
  changed: boolean
  newVersion?: number
  message: string
  error?: string
}

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

/**
 * Detect which spec sections are impacted by changes to the given node IDs.
 * Graph → Spec direction: when nodes change, find which spec sections are linked.
 */
export function detectSpecImpact(specStore: SpecStore, changedNodeIds: string[]): SpecImpact[] {
  const impacts: SpecImpact[] = []

  for (const nodeId of changedNodeIds) {
    const links = specStore.getLinksForNode(nodeId)
    for (const link of links) {
      impacts.push({
        specId: link.spec_id,
        sectionTitle: link.section_title,
        nodeId: link.node_id,
        linkType: link.link_type,
      })
    }
  }

  return impacts
}

/**
 * Sync a spec document with new content.
 * Spec → Graph direction: detects changes via content hash, creates new version if different.
 * v1: manual sync only — does not auto-propagate to linked nodes.
 */
export function syncSpecToGraph(specStore: SpecStore, specId: string, newContent: string): SyncResult {
  const spec = specStore.get(specId)
  if (!spec) {
    return { changed: false, message: 'Spec not found', error: `Spec not found: ${specId}` }
  }

  const newHash = contentHash(newContent)

  if (newHash === spec.content_hash) {
    return { changed: false, message: 'Spec unchanged (same content hash)' }
  }

  // Content changed — create new version
  specStore.update(specId, newContent, `Synced: content updated`)

  const updated = specStore.get(specId)
  const newVersion = updated?.version ?? spec.version + 1

  log.info('Spec synced', { specId, newVersion, oldHash: spec.content_hash, newHash })

  return {
    changed: true,
    newVersion,
    message: `Spec updated to version ${newVersion}`,
  }
}

export type SpecSyncStatus = 'synced' | 'stale' | 'diverged' | 'unknown'

/**
 * Determine the sync status of a spec relative to its stored content.
 * Compares the provided content hash against the stored hash.
 */
export function specSyncStatus(specStore: SpecStore, specId: string, currentContent: string): SpecSyncStatus {
  const spec = specStore.get(specId)
  if (!spec) return 'unknown'

  const currentHash = contentHash(currentContent)

  if (currentHash === spec.content_hash) {
    return 'synced'
  }

  const history = specStore.getHistory(specId)
  const anyVersionMatches = history.some((v) => v.content_hash === currentHash)
  if (anyVersionMatches) {
    return 'stale'
  }

  return 'diverged'
}
