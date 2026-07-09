import { describe, it, expect } from 'vitest'
import { deterministicRank, scoresDriftWithinTolerance } from '../core/search/deterministic-ranker.js'
import type { RankableItem } from '../core/search/deterministic-ranker.js'

function item(id: string, score: number): RankableItem {
  return { id, score }
}

describe('deterministicRank: score ordering', () => {
  it('sorts by score descending', () => {
    const items = [item('b', 0.5), item('a', 0.9), item('c', 0.3)]
    const result = deterministicRank(items)
    expect(result.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns empty array for empty input', () => {
    expect(deterministicRank([])).toEqual([])
  })

  it('does not mutate the original array', () => {
    const items = [item('b', 0.5), item('a', 0.9)]
    const original = [...items]
    deterministicRank(items)
    expect(items).toEqual(original)
  })
})

describe('deterministicRank: tiebreaker', () => {
  it('breaks score ties by id ascending', () => {
    const items = [item('z', 1.0), item('a', 1.0), item('m', 1.0)]
    const result = deterministicRank(items)
    expect(result.map((x) => x.id)).toEqual(['a', 'm', 'z'])
  })

  it('produces stable order across multiple calls', () => {
    const items = [item('c', 0.5), item('a', 0.5), item('b', 0.5)]
    const r1 = deterministicRank(items).map((x) => x.id)
    const r2 = deterministicRank(items).map((x) => x.id)
    expect(r1).toEqual(r2)
  })

  it('preserves extra properties on items', () => {
    const extended = [{ id: 'a', score: 1.0, extra: 'data' }]
    const result = deterministicRank(extended)
    expect(result[0].extra).toBe('data')
  })
})

describe('scoresDriftWithinTolerance', () => {
  it('returns true when scores are identical', () => {
    const items = [item('a', 0.9), item('b', 0.7)]
    expect(scoresDriftWithinTolerance(items, items, 0)).toBe(true)
  })

  it('returns true when drift is within tolerance', () => {
    const before = [item('a', 0.9)]
    const after = [item('a', 0.85)]
    expect(scoresDriftWithinTolerance(before, after, 0.1)).toBe(true)
  })

  it('returns false when drift exceeds tolerance', () => {
    const before = [item('a', 0.9)]
    const after = [item('a', 0.5)]
    expect(scoresDriftWithinTolerance(before, after, 0.1)).toBe(false)
  })

  it('returns false when an item is removed from after', () => {
    const before = [item('a', 0.9), item('b', 0.7)]
    const after = [item('a', 0.9)]
    expect(scoresDriftWithinTolerance(before, after, 0.5)).toBe(false)
  })

  it('returns true for empty before set', () => {
    expect(scoresDriftWithinTolerance([], [item('a', 0.9)], 0)).toBe(true)
  })
})
