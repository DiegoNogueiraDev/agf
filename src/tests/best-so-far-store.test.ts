/*!
 * TDD: best-so-far memory (node_73ee46684763, T3 elitist reset).
 *
 * WHY: an MMAS stagnation reset wipes the τ field to τ_max uniformly — good
 * learning about WHICH trail was best is lost (RISK node_42e2b0c49a94). The
 * honest, invariant-preserving fix is a SEPARATE memory: remember the champion
 * key across the reset. This pins that store.
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { recordBestSoFar, readBestSoFar } from '../core/economy/best-so-far-store.js'

function makeStore(): SqliteStore {
  const s = SqliteStore.open(':memory:')
  s.initProject('test-best-so-far')
  return s
}

describe('best-so-far-store', () => {
  it('records a champion and reads it back', () => {
    const s = makeStore()
    const db = s.getDb()
    const p = s.getProject()!.id
    recordBestSoFar(db, p, 'dominant', 5.0, 1000)
    expect(readBestSoFar(db, p)).toEqual({ key: 'dominant', strength: 5.0 })
    s.close()
  })

  it('returns null when nothing has been recorded', () => {
    const s = makeStore()
    expect(readBestSoFar(s.getDb(), s.getProject()!.id)).toBeNull()
    s.close()
  })

  it('keeps the champion across a later, weaker observation (best-so-far, not last)', () => {
    const s = makeStore()
    const db = s.getDb()
    const p = s.getProject()!.id
    recordBestSoFar(db, p, 'strong', 9.0, 1000)
    recordBestSoFar(db, p, 'weak', 1.0, 2000)
    expect(readBestSoFar(db, p)).toEqual({ key: 'strong', strength: 9.0 })
    s.close()
  })

  it('self-heals its table (no migration required)', () => {
    const s = makeStore()
    const db = s.getDb()
    db.exec('DROP TABLE IF EXISTS best_so_far')
    // Must not throw — the store creates its table at point of use.
    expect(() => recordBestSoFar(db, s.getProject()!.id, 'k', 2.0, 500)).not.toThrow()
    s.close()
  })
})
