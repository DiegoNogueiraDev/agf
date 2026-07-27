/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { parseFacetedSearch, applyFacetedFilter } from './faceted-search'

describe('parseFacetedSearch', () => {
  it('returns empty freeText and facets for an empty/whitespace input', () => {
    expect(parseFacetedSearch('')).toEqual({ freeText: '', facets: {} })
    expect(parseFacetedSearch('   ')).toEqual({ freeText: '', facets: {} })
  })

  it('parses a single known facet', () => {
    expect(parseFacetedSearch('status:done')).toEqual({ freeText: '', facets: { status: 'done' } })
  })

  it('parses multiple known facets combined with free text', () => {
    const result = parseFacetedSearch('status:done priority:1 auth login')
    expect(result.facets).toEqual({ status: 'done', priority: '1' })
    expect(result.freeText).toBe('auth login')
  })

  it('treats an unknown facet key as free text', () => {
    const result = parseFacetedSearch('color:red')
    expect(result.facets).toEqual({})
    expect(result.freeText).toBe('color:red')
  })

  it('lowercases the facet key but preserves the value case', () => {
    const result = parseFacetedSearch('STATUS:Done')
    expect(result.facets).toEqual({ status: 'Done' })
  })

  it('treats a bare "key:" (empty value) as free text, not a facet', () => {
    const result = parseFacetedSearch('status:')
    expect(result.facets).toEqual({})
    expect(result.freeText).toBe('status:')
  })
})

describe('applyFacetedFilter', () => {
  const nodes = [
    { title: 'Auth login flow', type: 'task', status: 'done', priority: 1, sprint: 'S1', tags: ['auth'] },
    { title: 'Dashboard chart', type: 'task', status: 'backlog', priority: 3, sprint: 'S2', tags: ['ui'] },
    { title: 'Auth logout flow', type: 'bug', status: 'done', priority: 2, sprint: 'S1', tags: [] },
  ]

  it('returns all nodes when the query is empty', () => {
    expect(applyFacetedFilter(nodes, { freeText: '', facets: {} })).toHaveLength(3)
  })

  it('filters by a single facet (status)', () => {
    const result = applyFacetedFilter(nodes, { freeText: '', facets: { status: 'done' } })
    expect(result).toHaveLength(2)
  })

  it('AND-combines multiple facets', () => {
    const result = applyFacetedFilter(nodes, { freeText: '', facets: { status: 'done', priority: '2' } })
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Auth logout flow')
  })

  it('filters by tag facet', () => {
    const result = applyFacetedFilter(nodes, { freeText: '', facets: { tag: 'ui' } })
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Dashboard chart')
  })

  it('matches free text against title, type, status, and sprint', () => {
    const result = applyFacetedFilter(nodes, { freeText: 'auth', facets: {} })
    expect(result).toHaveLength(2)
  })

  it('combines facets and free text', () => {
    const result = applyFacetedFilter(nodes, { freeText: 'login', facets: { status: 'done' } })
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Auth login flow')
  })

  it('is case-insensitive for both facets and free text', () => {
    const result = applyFacetedFilter(nodes, { freeText: 'AUTH', facets: { STATUS: 'DONE' } as never })
    expect(result.length).toBeGreaterThan(0)
  })
})
