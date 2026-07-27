/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export interface FacetedQuery {
  freeText: string
  facets: Record<string, string>
}

/** Known facet keys that are valid for filtering */
const VALID_FACETS = new Set(['status', 'type', 'priority', 'sprint', 'tag', 'size'])

/**
 * Parse a search string into facets and free text.
 *
 * Supported syntax: "status:done priority:1 auth login"
 * → { facets: { status: "done", priority: "1" }, freeText: "auth login" }
 *
 * Unknown facet keys are treated as free text.
 */
export function parseFacetedSearch(input: string): FacetedQuery {
  const facets: Record<string, string> = {}
  const freeTextParts: string[] = []

  const tokens = input.trim().split(/\s+/)
  if (tokens.length === 1 && tokens[0] === '') {
    return { freeText: '', facets: {} }
  }

  for (const token of tokens) {
    const colonIdx = token.indexOf(':')
    if (colonIdx > 0 && colonIdx < token.length - 1) {
      const key = token.slice(0, colonIdx).toLowerCase()
      const value = token.slice(colonIdx + 1)
      if (VALID_FACETS.has(key)) {
        facets[key] = value
        continue
      }
    }
    freeTextParts.push(token)
  }

  return {
    freeText: freeTextParts.join(' '),
    facets,
  }
}

interface FilterableNode {
  title: string
  type: string
  status: string
  priority: number
  sprint?: string | null
  tags?: string[]
  xpSize?: string
}

/**
 * Apply a faceted query to filter an array of nodes.
 * Facets are AND-combined. Free text is matched against title, type, status, sprint.
 */
export function applyFacetedFilter<T extends FilterableNode>(nodes: T[], query: FacetedQuery): T[] {
  let result = nodes

  // Apply facets
  for (const [key, value] of Object.entries(query.facets)) {
    const lv = value.toLowerCase()
    result = result.filter((n) => {
      switch (key) {
        case 'status':
          return n.status.toLowerCase() === lv
        case 'type':
          return n.type.toLowerCase() === lv
        case 'priority':
          return String(n.priority) === value
        case 'sprint':
          return (n.sprint ?? '').toLowerCase() === lv
        case 'tag':
          return n.tags?.some((t) => t.toLowerCase() === lv) ?? false
        case 'size':
          return (n.xpSize ?? '').toLowerCase() === lv
        default:
          return true
      }
    })
  }

  // Apply free text
  if (query.freeText) {
    const q = query.freeText.toLowerCase()
    result = result.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q) ||
        n.status.toLowerCase().includes(q) ||
        (n.sprint ?? '').toLowerCase().includes(q),
    )
  }

  return result
}
