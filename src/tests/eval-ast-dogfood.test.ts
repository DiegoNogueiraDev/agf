/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Task 4.2 — Benchmark AST no próprio src/
 *
 * AC:
 * 1. GIVEN `agf eval --suite ast-dogfood` WHEN executado sobre `src/core/`
 *    THEN reporta: arquivos processados, % redução média, bytes saved
 * 2. GIVEN benchmark WHEN rodado THEN savings entram no economy-lever-ledger
 *    com `lever="ast_compress"`
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { join } from 'node:path'
import { runAstDogfood, type AstDogfoodResult } from '../core/evals/ast-dogfood.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { summarizeByLever } from '../core/economy/economy-lever-ledger.js'
import type Database from 'better-sqlite3'

const CORE_DIR = join(process.cwd(), 'src/core')
const SESSION_ID = 'ast-dogfood-test'

let result: AstDogfoodResult
let db: Database.Database
let store: SqliteStore

// Run the benchmark once; all tests below share the result. Explicit timeout:
// this parses every file under src/core/ (hundreds of files) — the default
// 10s hook timeout is too tight under concurrent test-runner load (observed
// intermittent timeouts when many other suites' beforeAll hooks compete for
// CPU; standalone this completes in ~6s).
beforeAll(() => {
  store = SqliteStore.open(':memory:')
  store.initProject('ast-dogfood-test')
  db = store.getDb()
  result = runAstDogfood(CORE_DIR, db, { sessionId: SESSION_ID })
}, 30_000)

// ── AC1 — files processed, avg reduction %, bytes saved ──────────────────────

describe('AC1 — AST dogfood benchmark reports processing metrics', () => {
  it('filesProcessed > 0', () => {
    expect(result.filesProcessed).toBeGreaterThan(0)
  })

  it('totalBytesBefore > 0 and totalBytesAfter > 0', () => {
    expect(result.totalBytesBefore).toBeGreaterThan(0)
    expect(result.totalBytesAfter).toBeGreaterThan(0)
  })

  it('avgReductionPct is between 0 and 100', () => {
    expect(result.avgReductionPct).toBeGreaterThanOrEqual(0)
    expect(result.avgReductionPct).toBeLessThanOrEqual(100)
  })

  it('filesCompressed ≤ filesProcessed', () => {
    expect(result.filesCompressed).toBeGreaterThanOrEqual(0)
    expect(result.filesCompressed).toBeLessThanOrEqual(result.filesProcessed)
  })

  it('totalBytesSaved ≥ 0 and consistent with before/after', () => {
    expect(result.totalBytesSaved).toBeGreaterThanOrEqual(0)
    expect(result.totalBytesSaved).toBe(result.totalBytesBefore - result.totalBytesAfter)
  })
})

// ── AC2 — savings recorded in economy-lever-ledger ────────────────────────────

describe('AC2 — AST dogfood benchmark records savings in economy-lever-ledger', () => {
  it('lever events use lever="ast_compress" exclusively', () => {
    const levers = summarizeByLever(db, SESSION_ID)
    if (levers.length > 0) {
      expect(levers.every((l) => l.lever === 'ast_compress')).toBe(true)
    }
  })

  it('lever count matches filesCompressed', () => {
    const levers = summarizeByLever(db, SESSION_ID)
    const astLever = levers.find((l) => l.lever === 'ast_compress')
    const recordedCount = astLever?.count ?? 0
    expect(recordedCount).toBe(result.filesCompressed)
  })

  it('lever totalSaved matches totalBytesSaved in tokens (chars/4)', () => {
    const levers = summarizeByLever(db, SESSION_ID)
    const astLever = levers.find((l) => l.lever === 'ast_compress')
    const leverSavedTokens = astLever?.totalSaved ?? 0
    const expectedTokensSaved = Math.ceil(result.totalBytesSaved / 4)
    if (result.filesCompressed > 0) {
      expect(leverSavedTokens).toBeGreaterThan(0)
      expect(leverSavedTokens).toBeLessThanOrEqual(expectedTokensSaved + result.filesCompressed)
    } else {
      expect(leverSavedTokens).toBe(0)
    }
  })
})
