import { describe, it, expect } from 'vitest'
import { extractCitations, hasCitation } from '../core/citations/citation-extractor.js'

describe('extractCitations', () => {
  it('extracts a single citation', () => {
    expect(extractCitations('See §EPIC-7.3 for details')).toEqual(['§EPIC-7.3'])
  })

  it('extracts multiple citations', () => {
    const result = extractCitations('§ADR-0049 and §EPIC-13.1 are related')
    expect(result).toEqual(['§ADR-0049', '§EPIC-13.1'])
  })

  it('returns empty array when no citations found', () => {
    expect(extractCitations('no citations here')).toEqual([])
  })

  it('does not match bare § without proper format', () => {
    expect(extractCitations('§xyz')).toEqual([])
  })

  it('handles empty string', () => {
    expect(extractCitations('')).toEqual([])
  })
})

describe('hasCitation', () => {
  it('returns true when citation exists', () => {
    expect(hasCitation('See §EPIC-7.3 for details')).toBe(true)
  })

  it('returns false when no citation', () => {
    expect(hasCitation('no citation here')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(hasCitation('')).toBe(false)
  })
})
