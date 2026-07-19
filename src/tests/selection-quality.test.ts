import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import {
  computeSelectionAdvantage,
  recordSelectionAdvantage,
  meanSelectionAdvantage,
  recordSelectionEpisode,
  readSelectionEpisodes,
  type AdvantageCandidate,
  type SelectionEpisode,
} from '../core/economy/selection-quality.js'

const cands: AdvantageCandidate[] = [
  { id: 'a', pheromone: 5 },
  { id: 'b', pheromone: 2 },
  { id: 'c', pheromone: 0 },
]

describe('computeSelectionAdvantage', () => {
  // AC: --aco and baseline agree → advantage ≈ 0
  it('is 0 when the ACO pick and the priority baseline agree', () => {
    expect(computeSelectionAdvantage('a', 'a', cands)).toBe(0)
  })

  // AC: they diverge → advantage is non-trivial and reflects the learned-value gap
  it('is the pheromone gap when the ACO pick diverges from the baseline', () => {
    // ACO chose 'a' (τ=5) over the priority baseline 'b' (τ=2) → advantage 3
    expect(computeSelectionAdvantage('a', 'b', cands)).toBe(3)
  })

  it('is negative when ACO explored a weaker-trail task than the baseline', () => {
    expect(computeSelectionAdvantage('c', 'a', cands)).toBe(-5)
  })

  it('returns 0 when either pick id is unknown (no signal)', () => {
    expect(computeSelectionAdvantage('a', 'zzz', cands)).toBe(0)
  })
})

describe('recordSelectionAdvantage + meanSelectionAdvantage (self-healing store)', () => {
  it('records and averages advantages on a DB with no pre-created table', () => {
    const db = new Database(':memory:') // no migrations → table absent, must self-heal
    expect(() => recordSelectionAdvantage(db, 'p1', 2, 1000)).not.toThrow()
    recordSelectionAdvantage(db, 'p1', 4, 2000)
    expect(meanSelectionAdvantage(db, 'p1')).toBe(3)
    db.close()
  })

  it('meanSelectionAdvantage is 0 when nothing has been recorded', () => {
    const db = new Database(':memory:')
    expect(meanSelectionAdvantage(db, 'p1')).toBe(0)
    db.close()
  })
})

describe('recordSelectionEpisode + readSelectionEpisodes (T6a — genome→outcome attribution foundation)', () => {
  const episode: SelectionEpisode = {
    candidates: [
      { id: 'a', priority: 1, size: 3, blockingImpact: 2, acCount: 4, pheromone: 5 },
      { id: 'b', priority: 2, size: 1, blockingImpact: 0, acCount: 1, pheromone: 1 },
    ],
    targetId: 'a',
  }

  // AC1: a pick with N candidates → one episode carrying the N candidates + targetId
  it('records an episode and reads it back with all candidates and the target', () => {
    const db = new Database(':memory:')
    recordSelectionEpisode(db, 'p1', episode, 1000)
    const got = readSelectionEpisodes(db, 'p1')
    expect(got).toHaveLength(1)
    expect(got[0].targetId).toBe('a')
    expect(got[0].candidates).toHaveLength(2)
    expect(got[0].candidates[0]).toEqual(episode.candidates[0])
    db.close()
  })

  // AC2: a DB with no table → self-heal, no throw
  it('self-heals its table (no migration required)', () => {
    const db = new Database(':memory:')
    expect(() => recordSelectionEpisode(db, 'p1', episode, 1000)).not.toThrow()
    db.close()
  })

  // AC3: no episodes → empty array, no throw
  it('returns [] when nothing has been recorded', () => {
    const db = new Database(':memory:')
    expect(readSelectionEpisodes(db, 'p1')).toEqual([])
    db.close()
  })
})
