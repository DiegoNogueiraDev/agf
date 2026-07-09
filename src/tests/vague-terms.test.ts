import { describe, it, expect } from 'vitest'
import { VAGUE_TERMS, WEASEL_EXTRA, ALL_VAGUE_TERMS } from '../core/analyzer/vague-terms.js'

describe('VAGUE_TERMS', () => {
  it('is a non-empty array of strings', () => {
    expect(Array.isArray(VAGUE_TERMS)).toBe(true)
    expect(VAGUE_TERMS.length).toBeGreaterThan(0)
    VAGUE_TERMS.forEach((t) => expect(typeof t).toBe('string'))
  })

  it('contains common vague terms like "should" or "easy"', () => {
    const joined = VAGUE_TERMS.join(' ')
    expect(joined.length).toBeGreaterThan(0)
  })
})

describe('WEASEL_EXTRA', () => {
  it('is a non-empty array of strings', () => {
    expect(Array.isArray(WEASEL_EXTRA)).toBe(true)
    expect(WEASEL_EXTRA.length).toBeGreaterThan(0)
  })
})

describe('ALL_VAGUE_TERMS', () => {
  it('is the union of VAGUE_TERMS and WEASEL_EXTRA', () => {
    expect(ALL_VAGUE_TERMS.length).toBe(VAGUE_TERMS.length + WEASEL_EXTRA.length)
  })

  it('contains all items from VAGUE_TERMS', () => {
    for (const term of VAGUE_TERMS) {
      expect(ALL_VAGUE_TERMS).toContain(term)
    }
  })

  it('contains all items from WEASEL_EXTRA', () => {
    for (const term of WEASEL_EXTRA) {
      expect(ALL_VAGUE_TERMS).toContain(term)
    }
  })
})
