import { describe, it, expect } from 'vitest'
import { TfIdfIndex, rerankWithTfIdf } from '../core/search/tfidf.js'

describe('TfIdfIndex: addDocument + search', () => {
  it('returns empty results from empty index', () => {
    const index = new TfIdfIndex()
    expect(index.search('auth')).toEqual([])
  })

  it('finds a document that contains the query term', () => {
    const index = new TfIdfIndex()
    index.addDocument('doc-1', 'authentication module login')
    const results = index.search('authentication')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('doc-1')
  })

  it('returns empty for query with no matching terms', () => {
    const index = new TfIdfIndex()
    index.addDocument('doc-1', 'authentication module')
    const results = index.search('billing invoice')
    expect(results).toEqual([])
  })

  it('ranks more-relevant document higher', () => {
    const index = new TfIdfIndex()
    index.addDocument('doc-a', 'authentication auth login auth')
    index.addDocument('doc-b', 'billing payment invoice')
    const results = index.search('auth')
    expect(results[0].id).toBe('doc-a')
  })

  it('respects limit parameter', () => {
    const index = new TfIdfIndex()
    for (let i = 0; i < 5; i++) {
      index.addDocument(`doc-${i}`, `query term ${i}`)
    }
    const results = index.search('query', 2)
    expect(results.length).toBeLessThanOrEqual(2)
  })
})

describe('TfIdfIndex: invalidate + rebuild', () => {
  it('still returns results after invalidate()', () => {
    const index = new TfIdfIndex()
    index.addDocument('doc-1', 'authentication module')
    index.invalidate()
    const results = index.search('authentication')
    expect(results.length).toBeGreaterThan(0)
  })
})

describe('rerankWithTfIdf', () => {
  it('returns empty for empty candidates', () => {
    expect(rerankWithTfIdf([], 'query')).toEqual([])
  })

  it('ranks the best-matching candidate first', () => {
    const candidates = [
      { id: 'a', text: 'billing payment invoice' },
      { id: 'b', text: 'authentication login auth auth' },
    ]
    const results = rerankWithTfIdf(candidates, 'auth')
    expect(results[0].id).toBe('b')
  })

  it('returns scores as positive numbers', () => {
    const candidates = [{ id: 'x', text: 'search query result' }]
    const results = rerankWithTfIdf(candidates, 'search')
    expect(results[0].score).toBeGreaterThan(0)
  })

  it('respects limit parameter', () => {
    const candidates = Array.from({ length: 5 }, (_, i) => ({
      id: `d${i}`,
      text: `search result item ${i}`,
    }))
    const results = rerankWithTfIdf(candidates, 'search', 2)
    expect(results.length).toBeLessThanOrEqual(2)
  })
})
