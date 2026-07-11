/*!
 * TDD: insights spectra subcommand (node_0845a855a0e3).
 *
 * AC1: agf insights spectra → data.spectra has all 5 keys with numeric %.
 * AC2: buildSpectraFromStore returns default zero-scores when no data.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { runMigrations } from '../core/store/migrations.js'
import { buildSpectraFromStore } from '../core/insights/spectra-from-store.js'

function makeStore(): SqliteStore {
  const db = new Database(':memory:')
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('test')
  return store
}

describe('AC1: buildSpectraFromStore returns 5 spectra keys', () => {
  it('returns all 5 spectra with numeric values', () => {
    const store = makeStore()
    const result = buildSpectraFromStore(store)
    expect(result).toHaveProperty('autonomy')
    expect(result).toHaveProperty('precision')
    expect(result).toHaveProperty('selfLearning')
    expect(result).toHaveProperty('selfHealing')
    expect(result).toHaveProperty('memory')
    for (const val of Object.values(result)) {
      expect(typeof val).toBe('number')
      expect(val).toBeGreaterThanOrEqual(0)
      expect(val).toBeLessThanOrEqual(100)
    }
  })
})

describe('AC2: empty store yields default zero-scores', () => {
  it('all spectra are 0 with no task data', () => {
    const store = makeStore()
    const result = buildSpectraFromStore(store)
    expect(result.autonomy).toBe(0)
    expect(result.precision).toBe(0)
    expect(result.selfLearning).toBe(0)
    expect(result.selfHealing).toBe(0)
    expect(result.memory).toBe(0)
  })
})
