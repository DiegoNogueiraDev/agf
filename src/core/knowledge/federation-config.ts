/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Federation peer-list config.
 *
 * Stores the list of peer projects this project federates with. Each peer
 * is opened read-only on tick by `federation-tick.ts` and selected
 * categories of memories are pulled in via `learnFromProject`. The list
 * lives as a JSON blob in a single `project_settings` row — no schema
 * migration needed.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'federation-config.ts' })

export const FEDERATION_PEERS_KEY = 'federation_peers'

export interface FederationPeer {
  /** Friendly identifier — must be unique within this project's peer list. */
  projectName: string
  /** Absolute path to the peer's `workflow-graph/graph.db`. */
  graphDbPath: string
  /** Categories from CATEGORY_TO_SOURCE_TYPE in cross-project-learner.ts. */
  categories?: string[]
  /** Toggle without removing — disabled peers are skipped on tick. */
  enabled: boolean
}

function readPeers(store: SqliteStore): FederationPeer[] {
  const raw = store.getProjectSetting(FEDERATION_PEERS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (p): p is FederationPeer =>
        typeof p === 'object' &&
        p !== null &&
        typeof (p as FederationPeer).projectName === 'string' &&
        typeof (p as FederationPeer).graphDbPath === 'string' &&
        typeof (p as FederationPeer).enabled === 'boolean',
    )
  } catch (err) {
    log.warn('federation-config:parse_failed', { error: String(err) })
    return []
  }
}

function writePeers(store: SqliteStore, peers: FederationPeer[]): void {
  store.setProjectSetting(FEDERATION_PEERS_KEY, JSON.stringify(peers))
}

export function getFederationPeers(store: SqliteStore): FederationPeer[] {
  return readPeers(store)
}

/**
 * Add a peer or overwrite an existing one with the same `projectName`.
 * Idempotent: callers can safely re-register a peer to update its path
 * or categories without first removing.
 */
export function addFederationPeer(store: SqliteStore, peer: FederationPeer): void {
  const peers = readPeers(store)
  const idx = peers.findIndex((p) => p.projectName === peer.projectName)
  if (idx >= 0) {
    peers[idx] = peer
  } else {
    peers.push(peer)
  }
  writePeers(store, peers)
  log.info('federation-config:peer_added', { projectName: peer.projectName, enabled: peer.enabled })
}

export function removeFederationPeer(store: SqliteStore, projectName: string): void {
  const peers = readPeers(store)
  const next = peers.filter((p) => p.projectName !== projectName)
  if (next.length === peers.length) return
  writePeers(store, next)
  log.info('federation-config:peer_removed', { projectName })
}

export function setPeerEnabled(store: SqliteStore, projectName: string, enabled: boolean): void {
  const peers = readPeers(store)
  const idx = peers.findIndex((p) => p.projectName === projectName)
  if (idx < 0) return
  peers[idx] = { ...peers[idx], enabled }
  writePeers(store, peers)
  log.info('federation-config:peer_toggled', { projectName, enabled })
}
