/*!
 * TDD: compress-run records savings to economy_lever_ledger (node_d44a0227c552).
 *
 * AC1: Given compress run saves N tokens with a store, savings row is written.
 * AC2: Given no store, compress run still returns output (graceful no-op).
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations/index.js'
import { recordCompressRunSavings } from '../core/economy/compress-run-ledger.js'
import { summarizeByLever } from '../core/economy/economy-lever-ledger.js'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db)
  return db
}

describe('AC1: savings row written to lever ledger', () => {
  it('inserts one row with lever=exec_compress and saved=N', () => {
    const db = makeDb()
    recordCompressRunSavings(db, { tokensBefore: 200, tokensAfter: 100, saved: 100 })
    const summaries = summarizeByLever(db)
    const row = summaries.find((s) => s.lever === 'exec_compress')
    expect(row).toBeDefined()
    expect(row!.totalSaved).toBe(100)
  })

  it('accumulates across multiple runs', () => {
    const db = makeDb()
    recordCompressRunSavings(db, { tokensBefore: 100, tokensAfter: 60, saved: 40 })
    recordCompressRunSavings(db, { tokensBefore: 80, tokensAfter: 50, saved: 30 })
    const summaries = summarizeByLever(db)
    const row = summaries.find((s) => s.lever === 'exec_compress')
    expect(row!.totalSaved).toBe(70)
    expect(row!.count).toBe(2)
  })
})

describe('AC2: no DB → graceful no-op', () => {
  it('returns without throwing when db is null', () => {
    expect(() => recordCompressRunSavings(null, { tokensBefore: 100, tokensAfter: 80, saved: 20 })).not.toThrow()
  })
})
