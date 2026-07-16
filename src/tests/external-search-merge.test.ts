/*!
 * TDD: dedupe-por-entidade + RRF fusion for multi-source search (node_76e0d563eb8c).
 *
 * AC1: Given results from 2 sources with duplicate items,
 *      When merged, result is deduped by entity and ordered by RRF.
 * AC2: Given sources without overlap, When merged, all enter ordered by RRF.
 */

import { describe, it, expect } from 'vitest'
import type { SearchResult } from '../core/search/external-search-port.js'
import { mergeWithRrf } from '../core/search/external-search-port.js'

const makeResult = (url: string, title: string, source: string, snippet = ''): SearchResult => ({
  url,
  title,
  snippet,
  source,
})

describe('AC1: duplicate items are deduped and ordered by RRF', () => {
  it('deduplicates by URL across sources', () => {
    const list1 = [makeResult('https://example.com/a', 'A', 'exa'), makeResult('https://example.com/b', 'B', 'exa')]
    const list2 = [
      makeResult('https://example.com/a', 'A', 'tavily'), // duplicate URL
      makeResult('https://example.com/c', 'C', 'tavily'),
    ]
    const merged = mergeWithRrf([list1, list2])
    const urls = merged.map((r) => r.url)
    expect(urls.filter((u) => u === 'https://example.com/a')).toHaveLength(1)
    expect(urls).toHaveLength(3) // a, b, c
  })

  it('item present in both sources ranks higher (better RRF) than item in only one', () => {
    const shared = makeResult('https://example.com/shared', 'Shared', 'exa')
    const only1 = makeResult('https://example.com/only1', 'Only1', 'exa')
    const sharedCopy = makeResult('https://example.com/shared', 'Shared', 'tavily')
    const only2 = makeResult('https://example.com/only2', 'Only2', 'tavily')

    // shared appears at rank 1 in list1, rank 1 in list2 → high RRF
    const merged = mergeWithRrf([
      [shared, only1],
      [sharedCopy, only2],
    ])
    expect(merged[0].url).toBe('https://example.com/shared')
  })
})

describe('AC2: sources without overlap — all items enter, ordered by RRF', () => {
  it('includes all items when no overlap exists', () => {
    const list1 = [makeResult('https://a.com', 'A', 'exa'), makeResult('https://b.com', 'B', 'exa')]
    const list2 = [makeResult('https://c.com', 'C', 'tavily'), makeResult('https://d.com', 'D', 'tavily')]
    const merged = mergeWithRrf([list1, list2])
    expect(merged).toHaveLength(4)
    const urls = merged.map((r) => r.url)
    expect(urls).toContain('https://a.com')
    expect(urls).toContain('https://c.com')
  })

  it('returns results in descending RRF order (first item in each source ranks highest)', () => {
    const list1 = [makeResult('https://a.com', 'A', 'exa')]
    const list2 = [makeResult('https://b.com', 'B', 'tavily')]
    // Both at rank 1 from one source each — equal RRF; order stable by insertion
    const merged = mergeWithRrf([list1, list2])
    expect(merged).toHaveLength(2)
    // Scores must be non-ascending
    for (let i = 1; i < merged.length; i++) {
      expect((merged[i] as SearchResult & { rrfScore?: number }).rrfScore).toBeLessThanOrEqual(
        (merged[i - 1] as SearchResult & { rrfScore?: number }).rrfScore ?? 0,
      )
    }
  })
})
