import { describe, it, expect } from 'vitest'
import { isAmbiguous } from '../core/scaffolder/decide.js'
import type { RankedScaffold } from '../core/scaffolder/retrieve-rank.js'

function makeRanked(score: number): RankedScaffold {
  return {
    kind: 'contract',
    score,
    entry: {
      kind: 'contract',
      description: 'REST handler',
      capabilities: ['rest-handler'],
      keywords: ['contract'],
    },
  }
}

describe('isAmbiguous', () => {
  it('returns false for empty array', () => {
    expect(isAmbiguous([])).toBe(false)
  })

  it('returns false for single item', () => {
    expect(isAmbiguous([makeRanked(10)])).toBe(false)
  })

  it('returns true when top two scores are close (within threshold)', () => {
    const ranked = [makeRanked(10), makeRanked(9.5)]
    expect(isAmbiguous(ranked)).toBe(true)
  })

  it('returns false when top two scores are far apart', () => {
    const ranked = [makeRanked(10), makeRanked(5)]
    expect(isAmbiguous(ranked)).toBe(false)
  })

  it('returns true when scores are identical', () => {
    const ranked = [makeRanked(7), makeRanked(7)]
    expect(isAmbiguous(ranked)).toBe(true)
  })

  it('uses custom threshold', () => {
    const ranked = [makeRanked(10), makeRanked(7)]
    expect(isAmbiguous(ranked, 3)).toBe(true)
    expect(isAmbiguous(ranked, 2)).toBe(false)
  })

  it('ignores items beyond second in ranking', () => {
    const ranked = [makeRanked(10), makeRanked(5), makeRanked(9.9)]
    expect(isAmbiguous(ranked)).toBe(false)
  })
})
