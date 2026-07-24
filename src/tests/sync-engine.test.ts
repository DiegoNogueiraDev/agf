/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_0868e5d55717 AC coverage: sync-engine.ts
 *
 * AC1: GIVEN linked node WHEN detectSpecImpact THEN returns impact entries
 * AC2: syncSpecToGraph: changed=false for same content, changed=true with newVersion
 * AC3: specSyncStatus: synced/stale/diverged/unknown
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { SpecStore } from '../core/spec-evolution/spec-store.js'
import { detectSpecImpact, syncSpecToGraph, specSyncStatus } from '../core/spec-evolution/sync-engine.js'

// ── DB + SpecStore helpers ────────────────────────────────────────────────────

function makeStore(): SpecStore {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE spec_documents (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL,
      template_name TEXT, file_path TEXT, content_hash TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'draft',
      metadata TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE spec_document_versions (
      id TEXT PRIMARY KEY, spec_id TEXT NOT NULL, version INTEGER NOT NULL,
      content TEXT NOT NULL, content_hash TEXT NOT NULL, diff_summary TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE spec_node_links (
      id TEXT PRIMARY KEY, spec_id TEXT NOT NULL, node_id TEXT NOT NULL,
      section_title TEXT, link_type TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `)
  return new SpecStore(db)
}

const PROJECT = 'proj-test'
const CONTENT_V1 = 'Initial spec content — requirements for feature X'
const CONTENT_V2 = 'Updated spec content — more details added for feature X deployment'

describe('detectSpecImpact', () => {
  let store: SpecStore

  beforeEach(() => {
    store = makeStore()
  })

  it('AC1: returns [] when no nodes are linked', () => {
    const doc = store.register({ projectId: PROJECT, name: 'spec-a', content: CONTENT_V1 })
    const result = detectSpecImpact(store, [doc.id])
    expect(result).toHaveLength(0)
  })

  it('AC1: returns impact entry for linked node', () => {
    const doc = store.register({ projectId: PROJECT, name: 'spec-a', content: CONTENT_V1 })
    store.linkNode(doc.id, 'node_abc', 'Requirements', 'implements')
    const result = detectSpecImpact(store, ['node_abc'])
    expect(result).toHaveLength(1)
    expect(result[0]!.specId).toBe(doc.id)
    expect(result[0]!.nodeId).toBe('node_abc')
    expect(result[0]!.linkType).toBe('implements')
    expect(result[0]!.sectionTitle).toBe('Requirements')
  })

  it('AC1: returns multiple impacts when multiple specs link the same node', () => {
    const docA = store.register({ projectId: PROJECT, name: 'spec-a', content: CONTENT_V1 })
    const docB = store.register({ projectId: PROJECT, name: 'spec-b', content: CONTENT_V2 })
    store.linkNode(docA.id, 'node_x', 'Sec1', 'implements')
    store.linkNode(docB.id, 'node_x', 'Sec2', 'covers')
    const result = detectSpecImpact(store, ['node_x'])
    expect(result).toHaveLength(2)
  })

  it('AC1: returns [] for empty changedNodeIds', () => {
    expect(detectSpecImpact(store, [])).toHaveLength(0)
  })

  it('AC1: collects impacts for multiple changed nodes', () => {
    const doc = store.register({ projectId: PROJECT, name: 'spec-a', content: CONTENT_V1 })
    store.linkNode(doc.id, 'node_1', 'Sec1', 'implements')
    store.linkNode(doc.id, 'node_2', 'Sec2', 'covers')
    const result = detectSpecImpact(store, ['node_1', 'node_2'])
    expect(result).toHaveLength(2)
  })
})

describe('syncSpecToGraph', () => {
  let store: SpecStore

  beforeEach(() => {
    store = makeStore()
  })

  it('AC2: returns changed=false when content is the same', () => {
    const doc = store.register({ projectId: PROJECT, name: 'spec-a', content: CONTENT_V1 })
    const result = syncSpecToGraph(store, doc.id, CONTENT_V1)
    expect(result.changed).toBe(false)
    expect(result.error).toBeUndefined()
  })

  it('AC2: message indicates unchanged for same content', () => {
    const doc = store.register({ projectId: PROJECT, name: 'spec-a', content: CONTENT_V1 })
    const result = syncSpecToGraph(store, doc.id, CONTENT_V1)
    expect(result.message).toMatch(/unchanged/i)
  })

  it('AC2: returns changed=true for different content', () => {
    const doc = store.register({ projectId: PROJECT, name: 'spec-a', content: CONTENT_V1 })
    const result = syncSpecToGraph(store, doc.id, CONTENT_V2)
    expect(result.changed).toBe(true)
  })

  it('AC2: newVersion increments when content changes', () => {
    const doc = store.register({ projectId: PROJECT, name: 'spec-a', content: CONTENT_V1 })
    const result = syncSpecToGraph(store, doc.id, CONTENT_V2)
    expect(result.newVersion).toBe(2)
  })

  it('AC2: returns error when spec not found', () => {
    const result = syncSpecToGraph(store, 'spec_unknown', 'content')
    expect(result.changed).toBe(false)
    expect(result.error).toBeDefined()
  })
})

describe('specSyncStatus', () => {
  let store: SpecStore

  beforeEach(() => {
    store = makeStore()
  })

  it('AC3: returns unknown for unknown specId', () => {
    expect(specSyncStatus(store, 'spec_unknown', CONTENT_V1)).toBe('unknown')
  })

  it('AC3: returns synced when content hash matches stored', () => {
    const doc = store.register({ projectId: PROJECT, name: 'spec-a', content: CONTENT_V1 })
    expect(specSyncStatus(store, doc.id, CONTENT_V1)).toBe('synced')
  })

  it('AC3: returns diverged for content that was never stored', () => {
    const doc = store.register({ projectId: PROJECT, name: 'spec-a', content: CONTENT_V1 })
    expect(specSyncStatus(store, doc.id, 'completely different content never seen before XYZ')).toBe('diverged')
  })

  it('AC3: returns stale for content matching a previous version', () => {
    const doc = store.register({ projectId: PROJECT, name: 'spec-a', content: CONTENT_V1 })
    // Sync to v2 — v1 content goes to history
    syncSpecToGraph(store, doc.id, CONTENT_V2)
    // Now checking v1 content should be stale (it was in history)
    expect(specSyncStatus(store, doc.id, CONTENT_V1)).toBe('stale')
  })

  it('AC3: returns synced for current content after update', () => {
    const doc = store.register({ projectId: PROJECT, name: 'spec-a', content: CONTENT_V1 })
    syncSpecToGraph(store, doc.id, CONTENT_V2)
    expect(specSyncStatus(store, doc.id, CONTENT_V2)).toBe('synced')
  })
})
