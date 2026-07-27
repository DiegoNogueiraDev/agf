/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_72cc41283639 AC coverage: federation-config.ts
 *
 * AC1: GIVEN empty store WHEN getFederationPeers THEN returns []
 * AC2: GIVEN addFederationPeer WHEN new peer THEN peer is present
 * AC3: GIVEN same projectName WHEN addFederationPeer again THEN upserts (no dup)
 * AC4: GIVEN removeFederationPeer WHEN valid name THEN peer removed
 * AC5: GIVEN setPeerEnabled(false) WHEN peer exists THEN enabled=false
 * AC6: GIVEN malformed JSON WHEN getFederationPeers THEN returns [] (graceful)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  getFederationPeers,
  addFederationPeer,
  removeFederationPeer,
  setPeerEnabled,
  FEDERATION_PEERS_KEY,
  type FederationPeer,
} from '../core/knowledge/federation-config.js'

// ── Mock SqliteStore ─────────────────────────────────────────────────────────

function makeStore(initial?: string): {
  store: { getProjectSetting(k: string): string | null; setProjectSetting(k: string, v: string): void }
  backing: Map<string, string>
} {
  const backing = new Map<string, string>()
  if (initial !== undefined) backing.set(FEDERATION_PEERS_KEY, initial)
  const store = {
    getProjectSetting: (k: string) => backing.get(k) ?? null,
    setProjectSetting: (k: string, v: string) => {
      backing.set(k, v)
    },
  }
  return { store: store as never, backing }
}

const peer1: FederationPeer = {
  projectName: 'proj-a',
  graphDbPath: '/tmp/proj-a/graph.db',
  enabled: true,
}

const peer2: FederationPeer = {
  projectName: 'proj-b',
  graphDbPath: '/tmp/proj-b/graph.db',
  categories: ['test'],
  enabled: true,
}

// ── getFederationPeers ────────────────────────────────────────────────────────

describe('getFederationPeers', () => {
  it('AC1: returns [] when store has no key', () => {
    const { store } = makeStore()
    expect(getFederationPeers(store)).toEqual([])
  })

  it('AC6: returns [] when JSON is malformed', () => {
    const { store } = makeStore('not valid json {{{')
    expect(getFederationPeers(store)).toEqual([])
  })

  it('AC6: returns [] when JSON is not an array', () => {
    const { store } = makeStore('{"foo":"bar"}')
    expect(getFederationPeers(store)).toEqual([])
  })

  it('AC6: filters out invalid peer objects (missing required fields)', () => {
    const partial = JSON.stringify([{ projectName: 'x' }]) // missing graphDbPath + enabled
    const { store } = makeStore(partial)
    expect(getFederationPeers(store)).toEqual([])
  })

  it('returns valid peers when JSON is correct', () => {
    const { store } = makeStore(JSON.stringify([peer1]))
    const result = getFederationPeers(store)
    expect(result).toHaveLength(1)
    expect(result[0]!.projectName).toBe('proj-a')
  })

  it('returns multiple peers', () => {
    const { store } = makeStore(JSON.stringify([peer1, peer2]))
    expect(getFederationPeers(store)).toHaveLength(2)
  })
})

// ── addFederationPeer ─────────────────────────────────────────────────────────

describe('addFederationPeer', () => {
  let store: ReturnType<typeof makeStore>['store']
  let backing: Map<string, string>

  beforeEach(() => {
    const s = makeStore()
    store = s.store
    backing = s.backing
  })

  it('AC2: adds a new peer to empty store', () => {
    addFederationPeer(store, peer1)
    const peers = getFederationPeers(store)
    expect(peers).toHaveLength(1)
    expect(peers[0]!.projectName).toBe('proj-a')
  })

  it('AC2: persists graphDbPath and enabled fields', () => {
    addFederationPeer(store, peer1)
    const result = getFederationPeers(store)[0]!
    expect(result.graphDbPath).toBe('/tmp/proj-a/graph.db')
    expect(result.enabled).toBe(true)
  })

  it('AC3: upserts when projectName already exists (no duplicate)', () => {
    addFederationPeer(store, peer1)
    const updated = { ...peer1, graphDbPath: '/new/path.db', enabled: false }
    addFederationPeer(store, updated)
    const peers = getFederationPeers(store)
    expect(peers).toHaveLength(1)
    expect(peers[0]!.graphDbPath).toBe('/new/path.db')
    expect(peers[0]!.enabled).toBe(false)
  })

  it('AC3: two different projectNames → 2 peers (no upsert)', () => {
    addFederationPeer(store, peer1)
    addFederationPeer(store, peer2)
    expect(getFederationPeers(store)).toHaveLength(2)
  })

  it('persists categories when provided', () => {
    addFederationPeer(store, peer2)
    const result = getFederationPeers(store)[0]!
    expect(result.categories).toEqual(['test'])
  })

  it('writes to FEDERATION_PEERS_KEY', () => {
    addFederationPeer(store, peer1)
    expect(backing.has(FEDERATION_PEERS_KEY)).toBe(true)
  })
})

// ── removeFederationPeer ──────────────────────────────────────────────────────

describe('removeFederationPeer', () => {
  let store: ReturnType<typeof makeStore>['store']

  beforeEach(() => {
    const s = makeStore(JSON.stringify([peer1, peer2]))
    store = s.store
  })

  it('AC4: removes peer by projectName', () => {
    removeFederationPeer(store, 'proj-a')
    const peers = getFederationPeers(store)
    expect(peers).toHaveLength(1)
    expect(peers[0]!.projectName).toBe('proj-b')
  })

  it('AC4: no-op when projectName not found', () => {
    removeFederationPeer(store, 'nonexistent')
    expect(getFederationPeers(store)).toHaveLength(2)
  })

  it('removes last peer → empty list', () => {
    removeFederationPeer(store, 'proj-a')
    removeFederationPeer(store, 'proj-b')
    expect(getFederationPeers(store)).toHaveLength(0)
  })
})

// ── setPeerEnabled ────────────────────────────────────────────────────────────

describe('setPeerEnabled', () => {
  let store: ReturnType<typeof makeStore>['store']

  beforeEach(() => {
    const s = makeStore(JSON.stringify([peer1, peer2]))
    store = s.store
  })

  it('AC5: sets enabled=false for existing peer', () => {
    setPeerEnabled(store, 'proj-a', false)
    const peers = getFederationPeers(store)
    const a = peers.find((p) => p.projectName === 'proj-a')!
    expect(a.enabled).toBe(false)
  })

  it('sets enabled=true for a disabled peer', () => {
    setPeerEnabled(store, 'proj-a', false)
    setPeerEnabled(store, 'proj-a', true)
    const peers = getFederationPeers(store)
    const a = peers.find((p) => p.projectName === 'proj-a')!
    expect(a.enabled).toBe(true)
  })

  it('does not affect other peers', () => {
    setPeerEnabled(store, 'proj-a', false)
    const peers = getFederationPeers(store)
    const b = peers.find((p) => p.projectName === 'proj-b')!
    expect(b.enabled).toBe(true)
  })

  it('no-op when projectName not found', () => {
    setPeerEnabled(store, 'nonexistent', false)
    const peers = getFederationPeers(store)
    expect(peers.every((p) => p.enabled)).toBe(true)
  })
})
