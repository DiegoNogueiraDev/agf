import { describe, it, expect } from 'vitest'
import { parseVocab, mergeVocab, renderVocabSection, VOCAB_HEADER } from '../core/knowledge/ubiquitous-language.js'

describe('VOCAB_HEADER', () => {
  it('is a non-empty string', () => {
    expect(typeof VOCAB_HEADER).toBe('string')
    expect(VOCAB_HEADER.length).toBeGreaterThan(0)
  })
})

describe('parseVocab', () => {
  it('returns empty array when content has no vocab header', () => {
    expect(parseVocab('# Just a readme\nNo vocab here.')).toHaveLength(0)
  })

  it('returns empty array for empty string', () => {
    expect(parseVocab('')).toHaveLength(0)
  })

  it('parses a term from vocab section', () => {
    const content = `${VOCAB_HEADER}\n\n### Node\nA unit of work in the graph.\n`
    const terms = parseVocab(content)
    expect(terms.length).toBeGreaterThan(0)
    expect(terms[0]?.term).toBe('Node')
  })
})

describe('mergeVocab', () => {
  it('returns existing when incoming is empty', () => {
    const existing = [{ term: 'Node', definition: 'A unit of work' }]
    const result = mergeVocab(existing, [])
    expect(result).toHaveLength(1)
    expect(result[0]?.term).toBe('Node')
  })

  it('adds new term from incoming', () => {
    const result = mergeVocab([], [{ term: 'Edge', definition: 'A dependency link' }])
    expect(result).toHaveLength(1)
    expect(result[0]?.term).toBe('Edge')
  })

  it('throws on conflicting term definition', () => {
    const existing = [{ term: 'Node', definition: 'Old definition' }]
    const incoming = [{ term: 'Node', definition: 'New definition' }]
    expect(() => mergeVocab(existing, incoming)).toThrow('Node')
  })
})

describe('renderVocabSection', () => {
  it('returns a section with empty placeholder for empty terms', () => {
    const result = renderVocabSection([])
    expect(result).toContain('empty')
  })

  it('renders terms as markdown', () => {
    const terms = [{ term: 'Node', definition: 'A unit of work in the graph.' }]
    const result = renderVocabSection(terms)
    expect(result).toContain('Node')
    expect(result).toContain('A unit of work in the graph.')
  })
})
