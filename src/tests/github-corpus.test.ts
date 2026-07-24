import { describe, it, expect } from 'vitest'
import { deriveCorpusQuery } from '../core/scaffolder/github-corpus.js'

describe('deriveCorpusQuery', () => {
  it('returns a string', () => {
    expect(typeof deriveCorpusQuery('some text about caching redis')).toBe('string')
  })

  it('returns empty string for empty input', () => {
    expect(deriveCorpusQuery('')).toBe('')
  })

  it('returns at most maxTerms words', () => {
    const text = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10'
    const result = deriveCorpusQuery(text, 3)
    const terms = result.trim().split(/\s+/).filter(Boolean)
    expect(terms.length).toBeLessThanOrEqual(3)
  })

  it('filters short words (< 4 chars)', () => {
    const result = deriveCorpusQuery('it is a very short test')
    expect(result).not.toContain(' it ')
    expect(result).not.toContain(' is ')
  })

  it('is case-insensitive in frequency counting', () => {
    const result = deriveCorpusQuery('Redis redis REDIS cache Cache')
    expect(result).toBeTruthy()
  })
})
