/*!
 * TDD: agf savings --assert-min with seeded economy_lever_ledger (node_d3f3a2a3f80b).
 *
 * AC: Given a seeded ledger summing to 100 and --assert-min 200, when run, exit non-zero.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { recordLeverEvent } from '../core/economy/economy-lever-ledger.js'
import { assertMinSavings } from '../core/economy/savings-tracker.js'
import { summarizeByLever } from '../core/economy/economy-lever-ledger.js'

function makeDb() {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

describe('savings --assert-min with seeded ledger', () => {
  it('seeded ledger summing to 100 + assert-min 200 → pass:false (exit non-zero)', () => {
    const db = makeDb()

    // Seed ledger with entries summing to 100 saved tokens
    recordLeverEvent(db, {
      sessionId: 'test',
      nodeId: 'n1',
      lever: 'ncd_dedup',
      tokensBefore: 200,
      tokensAfter: 150,
      saved: 50,
      accepted: true,
      gateOutcome: 'accepted',
      score: 1.0,
    })
    recordLeverEvent(db, {
      sessionId: 'test',
      nodeId: 'n2',
      lever: 'forage_stop',
      tokensBefore: 300,
      tokensAfter: 250,
      saved: 50,
      accepted: true,
      gateOutcome: 'accepted',
      score: 1.0,
    })

    // Verify ledger sum = 100
    const levers = summarizeByLever(db)
    const totalSaved = levers.reduce((s, l) => s + l.totalSaved, 0)
    expect(totalSaved).toBe(100)

    // Assert-min 200 fails (100 < 200)
    const result = assertMinSavings(totalSaved, 200)
    expect(result.pass).toBe(false)
    expect(result.actual).toBe(100)
    expect(result.threshold).toBe(200)
  })

  it('seeded ledger summing to 300 + assert-min 200 → pass:true', () => {
    const db = makeDb()

    recordLeverEvent(db, {
      sessionId: 'test',
      nodeId: 'n1',
      lever: 'ncd_dedup',
      tokensBefore: 500,
      tokensAfter: 200,
      saved: 300,
      accepted: true,
      gateOutcome: 'accepted',
      score: 1.0,
    })

    const levers = summarizeByLever(db)
    const totalSaved = levers.reduce((s, l) => s + l.totalSaved, 0)
    const result = assertMinSavings(totalSaved, 200)
    expect(result.pass).toBe(true)
  })
})
