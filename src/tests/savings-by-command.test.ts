/*!
 * TDD: agf savings --by-command (node_196ed36e7913).
 *
 * AC1: Given run history, When getSavingsByCommand runs, Then shows saving% per command.
 * AC2: Commands with low savings are flagged.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { getSavingsByCommand, LOW_SAVINGS_THRESHOLD_PCT } from '../core/economy/savings-tracker.js'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

function insertLedgerRow(db: Database.Database, caller: string, inputTokens: number, cachedInputTokens: number): void {
  db.prepare(
    `INSERT INTO llm_call_ledger
      (id, ts, project_id, cell_id, run_id, node_id, caller, provider, model,
       input_tokens, output_tokens, cached_input_tokens, cache_creation_tokens, cost_usd, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    `lev_${Math.random().toString(36).slice(2)}`,
    new Date().toISOString(),
    'proj_test',
    'cell_test',
    'run_test',
    null,
    caller,
    'anthropic',
    'claude-test',
    inputTokens,
    100,
    cachedInputTokens,
    0,
    0.001,
    'ok',
  )
}

describe('AC1: savings per command', () => {
  it('aggregates cached_input_tokens by caller as saving%', () => {
    const db = makeDb()
    insertLedgerRow(db, 'agf-context', 1000, 800) // 80% cached
    insertLedgerRow(db, 'agf-next', 500, 50) // 10% cached

    const report = getSavingsByCommand(db)
    const ctx = report.find((r) => r.command === 'agf-context')
    const nxt = report.find((r) => r.command === 'agf-next')

    expect(ctx).toBeDefined()
    expect(ctx!.savingPct).toBeCloseTo(80, 0)
    expect(nxt).toBeDefined()
    expect(nxt!.savingPct).toBeCloseTo(10, 0)
  })
})

describe('AC2: low-savings commands are flagged', () => {
  it('flags commands below LOW_SAVINGS_THRESHOLD_PCT', () => {
    const db = makeDb()
    insertLedgerRow(db, 'agf-low-saver', 1000, 50) // 5% — below threshold

    const report = getSavingsByCommand(db)
    const low = report.find((r) => r.command === 'agf-low-saver')
    expect(low?.lowSavings).toBe(true)
  })

  it('does not flag commands above threshold', () => {
    const db = makeDb()
    insertLedgerRow(db, 'agf-good-saver', 1000, 600) // 60% — above threshold

    const report = getSavingsByCommand(db)
    const good = report.find((r) => r.command === 'agf-good-saver')
    expect(good?.lowSavings).toBe(false)
  })
})
