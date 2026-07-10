import { describe, it, expect } from 'vitest'
import { pheromoneWeightedSelect } from '../core/colony/pheromone-weighted-select.js'
import type { Candidate, SelectionWeights } from '../core/colony/pheromone-weighted-select.js'

const fixedRng = (value: number) => () => value

function cand(id: string, priority: number, size: number, pheromone: number): Candidate {
  return { id, priority, size, pheromone }
}

const w11: SelectionWeights = { alpha: 1, beta: 1 }
const w0b: SelectionWeights = { alpha: 0, beta: 1 }

describe('pheromoneWeightedSelect', () => {
  it('returns null for empty candidates', () => {
    expect(pheromoneWeightedSelect([], w11, fixedRng(0.5))).toBeNull()
  })

  it('returns the only candidate regardless of rng', () => {
    const c = cand('a', 1, 1, 1)
    expect(pheromoneWeightedSelect([c], w11, fixedRng(0.5))).toEqual(c)
    expect(pheromoneWeightedSelect([c], w11, fixedRng(0.99))).toEqual(c)
  })

  // AC1: GIVEN equal τ WHEN α=0 THEN pure heuristic η=1/(priority*size) drives selection
  it('falls back to pure heuristic (η) when α=0 — compatible with priority ordering', () => {
    const high = cand('high', 1, 1, 5) // priority 1 (highest), same pheromone doesn't matter with α=0
    const low = cand('low', 3, 1, 5) // priority 3
    // With α=0 all τ^α = 1; η(high) = 1/(1*1) = 1, η(low) = 1/(3*1) = 0.333
    // Total = 1.333; threshold=0 → high wins; threshold=0.75 → high wins (1/1.333≈0.75); threshold=0.76 → low wins
    expect(pheromoneWeightedSelect([high, low], w0b, fixedRng(0))).toEqual(high)
    // rng returns 0.99 → threshold=0.99*1.333≈1.32 → must fall to low
    expect(pheromoneWeightedSelect([high, low], w0b, fixedRng(0.99))).toEqual(low)
  })

  // AC1 stricter: equal τ, α=0 → deterministically pick highest-priority when rng=0
  it('selects highest-priority candidate first when rng=0 and α=0 with equal τ', () => {
    const candidates = [cand('p1', 1, 1, 3), cand('p2', 2, 1, 3), cand('p3', 3, 1, 3)]
    expect(pheromoneWeightedSelect(candidates, w0b, fixedRng(0))).toEqual(candidates[0])
  })

  // AC2: priority-3 task with τ 10× greater than priority-2 tasks CAN be selected
  it('allows high-pheromone lower-priority task to be selected (probability > 0)', () => {
    const strong = cand('strong', 3, 1, 10) // pheromone 10×
    const weak1 = cand('w1', 2, 1, 1)
    const weak2 = cand('w2', 2, 1, 1)
    // With α=1, β=1: score(strong)=10*(1/3)≈3.33, score(w1)=1*(1/2)=0.5, score(w2)=0.5
    // Total≈4.33; P(strong)≈0.77 > 0
    // rng=0 → select strong (first, highest score)
    expect(pheromoneWeightedSelect([strong, weak1, weak2], w11, fixedRng(0))).toEqual(strong)
  })

  it('priority-3 task has positive probability of selection with strong pheromone', () => {
    const strong = cand('strong', 3, 1, 10)
    const weak = cand('weak', 2, 1, 1)
    // score(strong)=10/3≈3.33, score(weak)=1/2=0.5, total≈3.83
    // P(strong)≈0.87. rng=0.88 → pick weak
    const result = pheromoneWeightedSelect([strong, weak], w11, fixedRng(0.88))
    expect(result).toEqual(weak)
    // rng=0.5 → pick strong (threshold=0.5*3.83≈1.91 < 3.33)
    const result2 = pheromoneWeightedSelect([strong, weak], w11, fixedRng(0.5))
    expect(result2).toEqual(strong)
  })

  it('does not mutate the input candidates array', () => {
    const candidates = [cand('a', 1, 1, 1), cand('b', 2, 1, 2)]
    const original = JSON.stringify(candidates)
    pheromoneWeightedSelect(candidates, w11, fixedRng(0.5))
    expect(JSON.stringify(candidates)).toEqual(original)
  })

  it('returns last candidate as floating-point safety fallback', () => {
    // If rng returns exactly 1.0 (edge), ensure a candidate is returned
    const a = cand('a', 1, 1, 1)
    const b = cand('b', 2, 1, 1)
    const result = pheromoneWeightedSelect([a, b], w11, fixedRng(1))
    expect(result).not.toBeNull()
  })

  it('tasks with zero pheromone and alpha>0 get zero score and cannot be selected', () => {
    const zeroPheromone = cand('zero', 1, 1, 0) // τ=0, α=1 → score=0
    const withPheromone = cand('some', 2, 1, 1) // τ=1, α=1 → score=0.5
    // any rng → only 'some' can be selected
    for (const r of [0, 0.3, 0.7, 0.99]) {
      expect(pheromoneWeightedSelect([zeroPheromone, withPheromone], w11, fixedRng(r))).toEqual(withPheromone)
    }
  })

  // T1 — enriched η: blocking-impact + AC-count fold into desirability (backward-compatible)
  describe('enriched η (blocking-impact + AC-count)', () => {
    // AC1: two candidates equal on priority×size, one unblocks more → strictly greater desirability.
    // Discriminating rng: without enrichment P(blocker)=0.5 (rng=0.6→leaf); with enrichment
    // η(blocker)=(1+3)/2=2, η(leaf)=1/2=0.5, total=2.5, P(blocker)=0.8 (rng=0.6→blocker).
    it('gives strictly greater desirability to the higher-blocking candidate (equal priority×size, α=0)', () => {
      const blocker: Candidate = { id: 'blocker', priority: 2, size: 1, pheromone: 1, blockingImpact: 3, acCount: 0 }
      const leaf: Candidate = { id: 'leaf', priority: 2, size: 1, pheromone: 1, blockingImpact: 0, acCount: 0 }
      expect(pheromoneWeightedSelect([blocker, leaf], w0b, fixedRng(0.6))).toEqual(blocker)
      // deep tail still reaches the leaf, proving it is not starved
      expect(pheromoneWeightedSelect([blocker, leaf], w0b, fixedRng(0.99))).toEqual(leaf)
    })

    // AC-count nudges desirability up. Without enrichment P(tested)=0.5 (rng=0.6→bare);
    // with enrichment η(tested)=(1+0.25*4)/2=1, η(bare)=0.5, total=1.5, P(tested)≈0.667 (rng=0.6→tested).
    it('gives higher desirability to the candidate with more acceptance criteria (equal otherwise, α=0)', () => {
      const tested: Candidate = { id: 'tested', priority: 2, size: 1, pheromone: 1, blockingImpact: 0, acCount: 4 }
      const bare: Candidate = { id: 'bare', priority: 2, size: 1, pheromone: 1, blockingImpact: 0, acCount: 0 }
      expect(pheromoneWeightedSelect([tested, bare], w0b, fixedRng(0.6))).toEqual(tested)
    })

    // Backward-compat: omitting the new fields must reduce η to 1/(priority*size) exactly
    it('reduces to η=1/(priority*size) when blocking-impact and AC-count are omitted', () => {
      const a: Candidate = { id: 'a', priority: 1, size: 1, pheromone: 1 } // η = 1/1 = 1
      const b: Candidate = { id: 'b', priority: 3, size: 1, pheromone: 1 } // η = 1/3
      // Identical to the pre-enrichment behaviour: total = 1.333, rng=0 → a, rng=0.99 → b
      expect(pheromoneWeightedSelect([a, b], w0b, fixedRng(0))).toEqual(a)
      expect(pheromoneWeightedSelect([a, b], w0b, fixedRng(0.99))).toEqual(b)
    })
  })
})
