/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { searchNodes, type SearchableNode } from '../tui/search-overlay.js'

const nodes: SearchableNode[] = [
  { id: 'n1', title: 'Dashboard Setup', type: 'task', status: 'done', parentId: null },
  { id: 'n2', title: 'Kanban Board View', type: 'task', status: 'in_progress', parentId: null },
  { id: 'n3', title: 'Graph Tree Component', type: 'task', status: 'backlog', parentId: null },
  { id: 'n4', title: 'Health Metrics Widget', type: 'task', status: 'backlog', parentId: null },
  { id: 'n5', title: 'Token Budget', type: 'epic', status: 'done', parentId: null },
]

describe('searchNodes', () => {
  it('returns all nodes when query is empty', () => {
    expect(searchNodes(nodes, '')).toHaveLength(5)
  })

  it('filters by title substring (case-insensitive)', () => {
    const r = searchNodes(nodes, 'dashboard')
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('n1')
  })

  it('returns multiple matches', () => {
    const r = searchNodes(nodes, 'view')
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('n2')
  })

  it('matches partial text', () => {
    const r = searchNodes(nodes, 'Tree')
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('n3')
  })

  it('is case-insensitive', () => {
    const r = searchNodes(nodes, 'DASHBOARD')
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('n1')
  })

  it('returns empty array when no match', () => {
    expect(searchNodes(nodes, 'zzzz')).toHaveLength(0)
  })

  it('scores exact title match higher than substring', () => {
    const mixed: SearchableNode[] = [
      { id: 'a', title: 'Health', type: 'task', status: 'backlog', parentId: null },
      { id: 'b', title: 'Health Check', type: 'task', status: 'backlog', parentId: null },
      { id: 'c', title: 'Check Health', type: 'task', status: 'backlog', parentId: null },
    ]
    const r = searchNodes(mixed, 'Health')
    expect(r[0].id).toBe('a')
  })
})
