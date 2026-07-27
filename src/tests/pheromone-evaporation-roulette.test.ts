import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { depositPheromone, getAggregatedTagPheromone, PHEROMONE_HALF_LIFE_MS } from '../core/economy/pheromone-store.js'
import { pheromoneWeightedSelect } from '../core/colony/pheromone-weighted-select.js'
import type { Candidate } from '../core/colony/pheromone-weighted-select.js'

function makeStore() {
  const store = SqliteStore.open(':memory:')
  store.initProject('test-evap')
  return store
}

function makeCandidate(id: string, pheromone: number): Candidate {
  return { id, priority: 1, size: 3, pheromone }
}

const NOW = 1_000_000_000_000 // arbitrary epoch anchor

describe('evaporation feeds roulette — AC1: old trail uses evaporated strength', () => {
  it('getAggregatedTagPheromone returns less than deposited amount after half-life passes', () => {
    const store = makeStore()
    const db = store.getDb()
    const projectId = store.getProject()!.id

    // Deposit amount=1 at NOW
    depositPheromone(db, projectId, 'tag:old', 1.0, NOW)

    // Read at NOW + half-life: should be ~0.5 (half-life decay)
    const strength = getAggregatedTagPheromone(db, projectId, ['old'], NOW + PHEROMONE_HALF_LIFE_MS)
    expect(strength).toBeGreaterThan(0)
    expect(strength).toBeLessThan(0.6) // well below original 1.0

    store.close()
  })

  it('fresh deposit (same raw amount) returns higher strength than old deposit', () => {
    const store = makeStore()
    const db = store.getDb()
    const projectId = store.getProject()!.id

    const AMOUNT = 1.0
    const AGE = PHEROMONE_HALF_LIFE_MS // 7 days old

    depositPheromone(db, projectId, 'tag:old-trail', AMOUNT, NOW - AGE)
    depositPheromone(db, projectId, 'tag:new-trail', AMOUNT, NOW)

    const oldStrength = getAggregatedTagPheromone(db, projectId, ['old-trail'], NOW)
    const newStrength = getAggregatedTagPheromone(db, projectId, ['new-trail'], NOW)

    expect(newStrength).toBeGreaterThan(oldStrength)
    store.close()
  })

  it('roulette candidates receive evaporated pheromone (not raw stored amount)', () => {
    const store = makeStore()
    const db = store.getDb()
    const projectId = store.getProject()!.id

    // Both deposited with same raw amount but different ages
    const AMOUNT = 2.0
    depositPheromone(db, projectId, 'tag:stale', AMOUNT, NOW - PHEROMONE_HALF_LIFE_MS * 2)
    depositPheromone(db, projectId, 'tag:fresh', AMOUNT, NOW)

    const staleStrength = getAggregatedTagPheromone(db, projectId, ['stale'], NOW)
    const freshStrength = getAggregatedTagPheromone(db, projectId, ['fresh'], NOW)

    // Build candidates as next-cmd.ts does
    const staleCandidate = makeCandidate('stale', staleStrength)
    const freshCandidate = makeCandidate('fresh', freshStrength)

    // Fresh should dominate: its evaporated pheromone is much higher
    expect(freshCandidate.pheromone).toBeGreaterThan(staleCandidate.pheromone)

    store.close()
  })
})

describe('evaporation feeds roulette — AC2: newer trail has higher selection probability', () => {
  it('newer trail wins more often than older trail under roulette selection', () => {
    const store = makeStore()
    const db = store.getDb()
    const projectId = store.getProject()!.id

    const AMOUNT = 1.0
    // Old trail (2 half-lives ago → ~25% of original)
    depositPheromone(db, projectId, 'tag:old', AMOUNT, NOW - PHEROMONE_HALF_LIFE_MS * 2)
    // New trail (fresh → ~100%)
    depositPheromone(db, projectId, 'tag:new', AMOUNT, NOW)

    const oldPheromone = getAggregatedTagPheromone(db, projectId, ['old'], NOW)
    const newPheromone = getAggregatedTagPheromone(db, projectId, ['new'], NOW)

    const candidates: Candidate[] = [makeCandidate('old-task', oldPheromone), makeCandidate('new-task', newPheromone)]

    // Run roulette 100 times with deterministic RNG sweep
    let newWins = 0
    let oldWins = 0
    const RUNS = 100
    for (let i = 0; i < RUNS; i++) {
      const rng = () => i / RUNS
      const chosen = pheromoneWeightedSelect(candidates, { alpha: 1, beta: 0 }, rng)
      if (chosen?.id === 'new-task') newWins++
      else oldWins++
    }

    // New trail should win significantly more (evaporated ~4x stronger)
    expect(newWins).toBeGreaterThan(oldWins)

    store.close()
  })

  it('zero-age trail with same amount as 1-half-life trail gets ~2x more probability', () => {
    const oldP = 0.5 // 1 half-life decayed from 1.0
    const newP = 1.0 // fresh

    const candidates: Candidate[] = [makeCandidate('old', oldP), makeCandidate('new', newP)]

    // With alpha=1 and beta=0 (pure pheromone), probability ratio = pheromone ratio
    // P(new) / P(old) = 1.0 / 0.5 = 2.0
    const totalP = oldP + newP
    const expectedNewRatio = newP / totalP
    const expectedOldRatio = oldP / totalP

    let newWins = 0
    const RUNS = 1000
    for (let i = 0; i < RUNS; i++) {
      const rng = () => i / RUNS
      const chosen = pheromoneWeightedSelect(candidates, { alpha: 1, beta: 0 }, rng)
      if (chosen?.id === 'new') newWins++
    }

    const observedNewRatio = newWins / RUNS
    expect(observedNewRatio).toBeCloseTo(expectedNewRatio, 1)
    expect(expectedNewRatio).toBeGreaterThan(expectedOldRatio)
  })
})
