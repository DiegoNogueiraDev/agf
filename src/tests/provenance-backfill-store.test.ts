/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { applyProvenanceBackfill } from '../core/harness/provenance-backfill-store.js'

describe('provenance-backfill-store', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY, source_file TEXT, metadata TEXT, updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY, from_node TEXT NOT NULL, to_node TEXT NOT NULL,
        relation_type TEXT NOT NULL
      )
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('should return zero updated when no nodes exist', () => {
    const result = applyProvenanceBackfill(db)
    expect(result.scanned).toBe(0)
    expect(result.updated).toBe(0)
  })

  it('should return zero updated when all nodes have source_file', () => {
    db.prepare(
      "INSERT INTO nodes (id, source_file, metadata, updated_at) VALUES ('n1', 'prd.md', '{}', '2024-01-01')",
    ).run()
    db.prepare(
      "INSERT INTO nodes (id, source_file, metadata, updated_at) VALUES ('n2', 'prd.md', '{}', '2024-01-01')",
    ).run()

    const result = applyProvenanceBackfill(db)
    expect(result.updated).toBe(0)
  })

  it('should backfill nodes missing source_file from parent', () => {
    db.prepare(
      "INSERT INTO nodes (id, source_file, metadata, updated_at) VALUES ('n1', 'prd.md', '{}', '2024-01-01')",
    ).run()
    db.prepare(
      "INSERT INTO nodes (id, source_file, metadata, updated_at) VALUES ('n2', NULL, '{}', '2024-01-01')",
    ).run()
    db.prepare("INSERT INTO edges (id, from_node, to_node, relation_type) VALUES ('e1', 'n1', 'n2', 'parent_of')").run()

    const result = applyProvenanceBackfill(db)
    expect(result.updated).toBe(1)

    const row = db.prepare('SELECT source_file, metadata FROM nodes WHERE id = ?').get('n2') as {
      source_file: string
      metadata: string
    }
    expect(row.source_file).toBe('prd.md')
    expect(row.metadata).toContain('inherited_from')
  })

  it('should handle metadata being NULL gracefully', () => {
    db.prepare(
      "INSERT INTO nodes (id, source_file, metadata, updated_at) VALUES ('n1', 'prd.md', NULL, '2024-01-01')",
    ).run()
    db.prepare(
      "INSERT INTO nodes (id, source_file, metadata, updated_at) VALUES ('n2', NULL, NULL, '2024-01-01')",
    ).run()
    db.prepare("INSERT INTO edges (id, from_node, to_node, relation_type) VALUES ('e1', 'n1', 'n2', 'parent_of')").run()

    const result = applyProvenanceBackfill(db)
    expect(result.updated).toBe(1)

    const row = db.prepare('SELECT source_file, metadata FROM nodes WHERE id = ?').get('n2') as {
      source_file: string
      metadata: string
    }
    expect(row.source_file).toBe('prd.md')
    expect(row.metadata).toContain('inherited_from')
  })

  it('should handle corrupt metadata gracefully', () => {
    db.prepare(
      "INSERT INTO nodes (id, source_file, metadata, updated_at) VALUES ('n1', 'prd.md', 'not-json', '2024-01-01')",
    ).run()
    db.prepare(
      "INSERT INTO nodes (id, source_file, metadata, updated_at) VALUES ('n2', NULL, 'not-json', '2024-01-01')",
    ).run()
    db.prepare("INSERT INTO edges (id, from_node, to_node, relation_type) VALUES ('e1', 'n1', 'n2', 'parent_of')").run()

    const result = applyProvenanceBackfill(db)
    expect(result.updated).toBe(1)

    const row = db.prepare('SELECT metadata FROM nodes WHERE id = ?').get('n2') as { metadata: string }
    const parsed = JSON.parse(row.metadata)
    expect(parsed.provenance.inherited_from).toBe('n1')
  })

  it('should preserve existing metadata fields when updating provenance', () => {
    db.prepare(
      "INSERT INTO nodes (id, source_file, metadata, updated_at) VALUES ('n1', 'prd.md', '{}', '2024-01-01')",
    ).run()
    db.prepare(
      "INSERT INTO nodes (id, source_file, metadata, updated_at) VALUES ('n2', NULL, '{\"existing\":42}', '2024-01-01')",
    ).run()
    db.prepare("INSERT INTO edges (id, from_node, to_node, relation_type) VALUES ('e1', 'n1', 'n2', 'parent_of')").run()

    applyProvenanceBackfill(db)
    const row = db.prepare('SELECT metadata FROM nodes WHERE id = ?').get('n2') as { metadata: string }
    const parsed = JSON.parse(row.metadata)
    expect(parsed.existing).toBe(42)
    expect(parsed.provenance.inherited_from).toBe('n1')
  })
})
