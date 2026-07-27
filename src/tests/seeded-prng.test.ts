import { describe, it, expect } from 'vitest'
import { makeSeededPrng } from '../core/utils/seeded-prng.js'
import { pheromoneWeightedSelect } from '../core/colony/pheromone-weighted-select.js'
import type { Candidate } from '../core/colony/pheromone-weighted-select.js'

describe('makeSeededPrng', () => {
  it('returns uniform values in [0, 1)', () => {
    const rand = makeSeededPrng(42)
    for (let i = 0; i < 100; i++) {
      const v = rand()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('is deterministic — same seed produces the same sequence', () => {
    const a = makeSeededPrng(12345)
    const b = makeSeededPrng(12345)
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('different seeds produce different sequences', () => {
    const a = makeSeededPrng(1)
    const b = makeSeededPrng(2)
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).not.toEqual(seqB)
  })

  // T2 AC: a fixed seed makes ACO selection reproducible (the contract the CLI --seed relies on).
  it('makes pheromoneWeightedSelect reproducible under a fixed seed', () => {
    const candidates: Candidate[] = [
      { id: 'a', priority: 1, size: 1, pheromone: 3 },
      { id: 'b', priority: 2, size: 1, pheromone: 5 },
      { id: 'c', priority: 3, size: 2, pheromone: 8 },
    ]
    const weights = { alpha: 1, beta: 2 }
    const pick1 = pheromoneWeightedSelect(candidates, weights, makeSeededPrng(777))
    const pick2 = pheromoneWeightedSelect(candidates, weights, makeSeededPrng(777))
    expect(pick1).not.toBeNull()
    expect(pick1!.id).toEqual(pick2!.id)
  })
})
