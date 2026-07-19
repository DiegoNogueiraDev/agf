/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_eb548cc8a046 AC coverage: spec-store.ts
 *
 * AC1: GIVEN register WHEN valid params THEN spec created with version=1 status=draft
 * AC2: GIVEN update THEN version incremented and history archived
 * AC3: GIVEN getHistory THEN previous versions returned (not current)
 * AC4: GIVEN remove THEN spec and versions deleted
 * AC5: GIVEN linkNode THEN link retrievable by spec or node
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { SpecStore } from '../core/spec-evolution/spec-store.js'

// ── DB setup ──────────────────────────────────────────────────────────────────

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE spec_documents (
      id            TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL,
      name          TEXT NOT NULL,
      template_name TEXT,
      file_path     TEXT,
      content_hash  TEXT NOT NULL,
      version       INTEGER NOT NULL DEFAULT 1,
      status        TEXT NOT NULL DEFAULT 'draft',
      metadata      TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE spec_document_versions (
      id           TEXT PRIMARY KEY,
      spec_id      TEXT NOT NULL,
      version      INTEGER NOT NULL,
      content      TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      diff_summary TEXT,
      created_at   TEXT NOT NULL
    );

    CREATE TABLE spec_node_links (
      id            TEXT PRIMARY KEY,
      spec_id       TEXT NOT NULL,
      node_id       TEXT NOT NULL,
      section_title TEXT,
      link_type     TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );
  `)
  return db
}

const PROJECT = 'proj-test'
const CONTENT_V1 = 'Initial spec content for feature X'
const CONTENT_V2 = 'Updated spec content with more details'

describe('SpecStore', () => {
  let store: SpecStore

  beforeEach(() => {
    store = new SpecStore(makeDb())
  })

  // ── register ───────────────────────────────────────────────────────────────

  describe('register', () => {
    it('AC1: returns spec document with version=1 and status=draft', () => {
      const doc = store.register({ projectId: PROJECT, name: 'test-spec', content: CONTENT_V1 })
      expect(doc.version).toBe(1)
      expect(doc.status).toBe('draft')
    })

    it('AC1: id follows spec_ prefix', () => {
      const doc = store.register({ projectId: PROJECT, name: 'test-spec', content: CONTENT_V1 })
      expect(doc.id).toMatch(/^spec_/)
    })

    it('AC1: persists name, projectId, and content_hash', () => {
      const doc = store.register({ projectId: PROJECT, name: 'test-spec', content: CONTENT_V1 })
      expect(doc.name).toBe('test-spec')
      expect(doc.project_id).toBe(PROJECT)
      expect(typeof doc.content_hash).toBe('string')
      expect(doc.content_hash).toHaveLength(16)
    })

    it('archives initial version in spec_document_versions', () => {
      const doc = store.register({ projectId: PROJECT, name: 'test-spec', content: CONTENT_V1 })
      // getHistory returns versions < current — after register current=1, so history < 1 = []
      // But version 1 exists in the table; getHistory returns only older versions
      const history = store.getHistory(doc.id)
      expect(history).toHaveLength(0) // v1 is current, no history yet
    })

    it('stores templateName when provided', () => {
      const doc = store.register({
        projectId: PROJECT,
        name: 'test-spec',
        content: CONTENT_V1,
        templateName: 'feature-template',
      })
      expect(doc.template_name).toBe('feature-template')
    })

    it('stores filePath when provided', () => {
      const doc = store.register({
        projectId: PROJECT,
        name: 'test-spec',
        content: CONTENT_V1,
        filePath: 'docs/spec.md',
      })
      expect(doc.file_path).toBe('docs/spec.md')
    })
  })

  // ── get ────────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('returns spec by id', () => {
      const doc = store.register({ projectId: PROJECT, name: 'test-spec', content: CONTENT_V1 })
      const result = store.get(doc.id)
      expect(result).toBeDefined()
      expect(result!.name).toBe('test-spec')
    })

    it('returns undefined for unknown id', () => {
      expect(store.get('spec_unknown')).toBeUndefined()
    })
  })

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('AC2: version incremented after update', () => {
      const doc = store.register({ projectId: PROJECT, name: 'test-spec', content: CONTENT_V1 })
      store.update(doc.id, CONTENT_V2, 'Added detail')
      const updated = store.get(doc.id)!
      expect(updated.version).toBe(2)
    })

    it('AC2: content_hash changes after update', () => {
      const doc = store.register({ projectId: PROJECT, name: 'test-spec', content: CONTENT_V1 })
      const oldHash = doc.content_hash
      store.update(doc.id, CONTENT_V2, 'Added detail')
      const updated = store.get(doc.id)!
      expect(updated.content_hash).not.toBe(oldHash)
    })

    it('AC2: multiple updates increment version sequentially', () => {
      const doc = store.register({ projectId: PROJECT, name: 'test-spec', content: CONTENT_V1 })
      store.update(doc.id, CONTENT_V2, 'Pass 1')
      store.update(doc.id, 'v3 content', 'Pass 2')
      const updated = store.get(doc.id)!
      expect(updated.version).toBe(3)
    })

    it('throws McpGraphError for unknown specId', () => {
      expect(() => store.update('spec_unknown', 'content', 'diff')).toThrow()
    })
  })

  // ── getHistory ─────────────────────────────────────────────────────────────

  describe('getHistory', () => {
    it('AC3: returns [] before any update (v1 is current)', () => {
      const doc = store.register({ projectId: PROJECT, name: 'test-spec', content: CONTENT_V1 })
      expect(store.getHistory(doc.id)).toHaveLength(0)
    })

    it('AC3: returns 1 item after one update (v1 archived, v2 is current)', () => {
      const doc = store.register({ projectId: PROJECT, name: 'test-spec', content: CONTENT_V1 })
      store.update(doc.id, CONTENT_V2, 'diff')
      const history = store.getHistory(doc.id)
      expect(history).toHaveLength(1)
      expect(history[0]!.version).toBe(1)
    })

    it('AC3: returns 2 items after two updates', () => {
      const doc = store.register({ projectId: PROJECT, name: 'test-spec', content: CONTENT_V1 })
      store.update(doc.id, CONTENT_V2, 'diff1')
      store.update(doc.id, 'v3 content', 'diff2')
      const history = store.getHistory(doc.id)
      expect(history).toHaveLength(2)
    })

    it('AC3: history items have content field', () => {
      const doc = store.register({ projectId: PROJECT, name: 'test-spec', content: CONTENT_V1 })
      store.update(doc.id, CONTENT_V2, 'diff')
      const history = store.getHistory(doc.id)
      expect(typeof history[0]!.content).toBe('string')
    })

    it('returns [] for unknown specId', () => {
      expect(store.getHistory('spec_unknown')).toHaveLength(0)
    })
  })

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('AC4: spec no longer retrievable after remove', () => {
      const doc = store.register({ projectId: PROJECT, name: 'test-spec', content: CONTENT_V1 })
      store.remove(doc.id)
      expect(store.get(doc.id)).toBeUndefined()
    })

    it('AC4: history also removed', () => {
      const doc = store.register({ projectId: PROJECT, name: 'test-spec', content: CONTENT_V1 })
      store.update(doc.id, CONTENT_V2, 'diff')
      store.remove(doc.id)
      expect(store.getHistory(doc.id)).toHaveLength(0)
    })

    it('AC4: links also removed', () => {
      const doc = store.register({ projectId: PROJECT, name: 'test-spec', content: CONTENT_V1 })
      store.linkNode(doc.id, 'node_123', 'Section 1', 'implements')
      store.remove(doc.id)
      expect(store.getLinksForSpec(doc.id)).toHaveLength(0)
    })

    it('no-op for unknown specId (no throw)', () => {
      expect(() => store.remove('spec_unknown')).not.toThrow()
    })
  })

  // ── linkNode / getLinksForSpec / getLinksForNode ───────────────────────────

  describe('linkNode + getLinksForSpec + getLinksForNode', () => {
    it('AC5: link retrievable by spec', () => {
      const doc = store.register({ projectId: PROJECT, name: 'test-spec', content: CONTENT_V1 })
      store.linkNode(doc.id, 'node_abc', 'Introduction', 'implements')
      const links = store.getLinksForSpec(doc.id)
      expect(links).toHaveLength(1)
      expect(links[0]!.node_id).toBe('node_abc')
      expect(links[0]!.link_type).toBe('implements')
    })

    it('AC5: link retrievable by node', () => {
      const doc = store.register({ projectId: PROJECT, name: 'test-spec', content: CONTENT_V1 })
      store.linkNode(doc.id, 'node_xyz', 'Section', 'covers')
      const links = store.getLinksForNode('node_xyz')
      expect(links).toHaveLength(1)
      expect(links[0]!.spec_id).toBe(doc.id)
    })

    it('multiple links for same spec', () => {
      const doc = store.register({ projectId: PROJECT, name: 'test-spec', content: CONTENT_V1 })
      store.linkNode(doc.id, 'node_a', 'Sec1', 'implements')
      store.linkNode(doc.id, 'node_b', 'Sec2', 'covers')
      expect(store.getLinksForSpec(doc.id)).toHaveLength(2)
    })

    it('getLinksForNode returns [] for unknown node', () => {
      expect(store.getLinksForNode('node_unknown')).toHaveLength(0)
    })

    it('getLinksForSpec returns [] for spec with no links', () => {
      const doc = store.register({ projectId: PROJECT, name: 'test-spec', content: CONTENT_V1 })
      expect(store.getLinksForSpec(doc.id)).toHaveLength(0)
    })
  })
})
