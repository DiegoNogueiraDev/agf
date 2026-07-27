/*!
 * Tests for src/core/scan/feature-extractor.ts
 * AC:
 *   - Distinctive term for a repo NOT in capability-lexicon is revealed by TF-IDF
 *   - High-frequency background term is NOT top-ranked (IDF demotes it)
 */

import { describe, it, expect } from 'vitest'
import { extractDistinctiveFeatures } from '../core/scan/feature-extractor.js'
import type { CorpusDocument } from '../core/scan/feature-extractor.js'

function doc(id: string, text: string): CorpusDocument {
  return { id, text }
}

describe('extractDistinctiveFeatures', () => {
  it('reveals distinctive terms for a document not in the background corpus', () => {
    const corpus: CorpusDocument[] = [
      doc('A', 'quantum entanglement superposition qubit'),
      doc('B', 'the and of to in is'),
      doc('C', 'the and of to in is'),
    ]
    const result = extractDistinctiveFeatures(corpus, 'A', { topN: 3 })
    // "quantum", "entanglement", etc. should rank higher than stop words
    expect(result.terms.length).toBeGreaterThan(0)
    expect(result.terms[0].term).toMatch(/quantum|entanglement|superposition|qubit/)
  })

  it('demotes high-frequency background terms (IDF filter)', () => {
    const corpus: CorpusDocument[] = [
      doc('target', 'the the the the the the the compute'),
      doc('bg1', 'the and or in is'),
      doc('bg2', 'the and or in'),
      doc('bg3', 'the and or in'),
    ]
    const result = extractDistinctiveFeatures(corpus, 'target', { topN: 3 })
    const terms = result.terms.map((t) => t.term)
    // "the" appears in ALL docs — IDF≈0 → should not be top term
    expect(terms[0]).not.toBe('the')
    // "compute" appears only in target → high IDF → should be top
    expect(terms).toContain('compute')
  })

  it('returns empty terms for unknown docId', () => {
    const corpus = [doc('A', 'hello world')]
    const result = extractDistinctiveFeatures(corpus, 'UNKNOWN', { topN: 5 })
    expect(result.terms).toHaveLength(0)
  })

  it('top terms count is bounded by topN', () => {
    const corpus = [doc('A', 'alpha beta gamma delta epsilon'), doc('B', 'zeta eta theta')]
    const result = extractDistinctiveFeatures(corpus, 'A', { topN: 2 })
    expect(result.terms.length).toBeLessThanOrEqual(2)
  })
})
