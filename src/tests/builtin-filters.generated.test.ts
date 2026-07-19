/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_221df79f8024 — Tests for BUILTIN_FILTERS_TOML constant and ast-dogfood
 * AC: GIVEN BUILTIN_FILTERS_TOML WHEN imported THEN non-empty string containing [[filters]]
 * AC: GIVEN runAstDogfood with :memory: db WHEN called on empty dir THEN returns zero-result
 */
import { describe, it, expect } from 'vitest'
import { BUILTIN_FILTERS_TOML } from '../core/tool-compress/builtin-filters.generated.js'
import { runAstDogfood } from '../core/evals/ast-dogfood.js'
import Database from 'better-sqlite3'

describe('BUILTIN_FILTERS_TOML', () => {
  it('is a non-empty string', () => {
    expect(typeof BUILTIN_FILTERS_TOML).toBe('string')
    expect(BUILTIN_FILTERS_TOML.length).toBeGreaterThan(0)
  })

  it('contains [[filters]] TOML array syntax', () => {
    expect(BUILTIN_FILTERS_TOML).toContain('[[filters]]')
  })

  it('contains at least one name field', () => {
    expect(BUILTIN_FILTERS_TOML).toMatch(/name\s*=\s*"/)
  })

  it('contains multiple filter entries (>10)', () => {
    const count = (BUILTIN_FILTERS_TOML.match(/\[\[filters\]\]/g) ?? []).length
    expect(count).toBeGreaterThan(10)
  })
})

describe('runAstDogfood', () => {
  function makeDb(): Database.Database {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE IF NOT EXISTS economy_lever_ledger (
        id TEXT PRIMARY KEY,
        ts INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        node_id TEXT,
        lever TEXT NOT NULL,
        tokens_before INTEGER NOT NULL DEFAULT 0,
        tokens_after INTEGER NOT NULL DEFAULT 0,
        saved INTEGER NOT NULL DEFAULT 0,
        accepted INTEGER NOT NULL DEFAULT 0,
        gate_outcome TEXT NOT NULL DEFAULT 'accepted',
        score REAL,
        baseline_method TEXT,
        surface TEXT
      )
    `)
    return db
  }

  it('returns zero result when directory is empty (or non-existent)', () => {
    const db = makeDb()
    const result = runAstDogfood('/nonexistent-dir-for-test', db, { sessionId: 'test-session' })
    expect(result.filesProcessed).toBe(0)
    expect(result.filesCompressed).toBe(0)
    expect(result.totalBytesSaved).toBe(0)
    db.close()
  })

  it('processes ts files in a real directory and returns sensible results', () => {
    const db = makeDb()
    const srcDir = new URL('../../src/core/utils', import.meta.url).pathname
    const result = runAstDogfood(srcDir, db, { sessionId: 'test-session-2', nodeId: 'n1' })
    expect(result.filesProcessed).toBeGreaterThan(0)
    expect(result.totalBytesBefore).toBeGreaterThan(0)
    expect(result.avgReductionPct).toBeGreaterThanOrEqual(0)
    db.close()
  })
})
