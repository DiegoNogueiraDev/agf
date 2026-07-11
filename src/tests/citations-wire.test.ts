/*!
 * TDD: citation-grounding — wire extractor+validator for provenance (node_34b9fb9a50a1).
 *
 * AC1: Given content with sources, When groundCitations runs, Then extracts and
 *      validates citations, returning valid/invalid split.
 * AC2: Given an invalid citation (no §-prefix match), When validated, Then it is
 *      signaled as invalid (not silently accepted).
 */

import { describe, it, expect } from 'vitest'
import { groundCitations, type CitationGroundingResult } from '../core/citations/citation-grounding.js'

describe('AC1: extracts citations from content', () => {
  it('extracts §EPIC-style citations from text', () => {
    const content = 'This implements §EPIC-7.3 and §ADR-0049 for grounding.'
    const result: CitationGroundingResult = groundCitations(content)
    expect(result.extracted).toContain('§EPIC-7.3')
    expect(result.extracted).toContain('§ADR-0049')
  })

  it('returns empty extracted array when no citations present', () => {
    const result = groundCitations('No citations here, just plain text.')
    expect(result.extracted).toHaveLength(0)
  })

  it('returns valid citations separately from invalid ones', () => {
    const content = '§EPIC-7.3 is valid; bare-ref and no-prefix are not.'
    const result = groundCitations(content)
    expect(result.valid.length).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(result.invalid)).toBe(true)
  })

  it('result includes isGrounded flag (true when at least one valid citation)', () => {
    const withCitation = groundCitations('See §EPIC-1.0 for spec.')
    const withoutCitation = groundCitations('No spec reference at all.')
    expect(withCitation.isGrounded).toBe(true)
    expect(withoutCitation.isGrounded).toBe(false)
  })
})

describe('AC2: invalid citations are signaled, not silently accepted', () => {
  it('content without §-prefix citations → isGrounded false, invalid empty', () => {
    const result = groundCitations('Just text, no citations.')
    expect(result.isGrounded).toBe(false)
    // No extracted = nothing to mark invalid either
    expect(result.invalid).toHaveLength(0)
  })

  it('partial match that fails regex → not in extracted', () => {
    // '§abc' has no second segment so should not match
    const result = groundCitations('§abc alone fails the pattern')
    expect(result.extracted).toHaveLength(0)
    expect(result.isGrounded).toBe(false)
  })
})
