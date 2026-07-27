/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { scanProvenance } from '../core/harness/provenance-scanner.js'

describe('provenance-scanner', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec('CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, source_file TEXT)')
  })

  afterEach(() => {
    db.close()
  })

  it('should return score 100 when there are no nodes', () => {
    const result = scanProvenance(db)
    expect(result.provenanceScore).toBe(100)
    expect(result.totalNodes).toBe(0)
    expect(result.nodesWithReceipt).toBe(0)
  })

  it('should return 100 when all nodes have source_file', () => {
    db.prepare("INSERT INTO nodes (id, source_file) VALUES ('n1', 'prd.md')").run()
    db.prepare("INSERT INTO nodes (id, source_file) VALUES ('n2', 'spec.md')").run()

    const result = scanProvenance(db)
    expect(result.provenanceScore).toBe(100)
    expect(result.totalNodes).toBe(2)
    expect(result.nodesWithReceipt).toBe(2)
  })

  it('should return 0 when no nodes have source_file', () => {
    db.prepare("INSERT INTO nodes (id, source_file) VALUES ('n1', NULL)").run()
    db.prepare("INSERT INTO nodes (id, source_file) VALUES ('n2', '')").run()

    const result = scanProvenance(db)
    expect(result.provenanceScore).toBe(0)
    expect(result.totalNodes).toBe(2)
    expect(result.nodesWithReceipt).toBe(0)
  })

  it('should calculate partial score correctly', () => {
    db.prepare("INSERT INTO nodes (id, source_file) VALUES ('n1', 'prd.md')").run()
    db.prepare("INSERT INTO nodes (id, source_file) VALUES ('n2', NULL)").run()
    db.prepare("INSERT INTO nodes (id, source_file) VALUES ('n3', 'spec.md')").run()
    db.prepare("INSERT INTO nodes (id, source_file) VALUES ('n4', NULL)").run()

    const result = scanProvenance(db)
    expect(result.provenanceScore).toBe(50)
    expect(result.totalNodes).toBe(4)
    expect(result.nodesWithReceipt).toBe(2)
  })

  it('should round score to nearest integer', () => {
    db.prepare("INSERT INTO nodes (id, source_file) VALUES ('n1', 'prd.md')").run()
    db.prepare("INSERT INTO nodes (id, source_file) VALUES ('n2', NULL)").run()
    db.prepare("INSERT INTO nodes (id, source_file) VALUES ('n3', NULL)").run()

    const result = scanProvenance(db)
    expect(result.provenanceScore).toBe(33)
    expect(result.totalNodes).toBe(3)
    expect(result.nodesWithReceipt).toBe(1)
  })
})
