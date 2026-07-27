/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { compactNode, compactItems, type CompactableNode } from '../tui/compact-format.js'

const nodes: CompactableNode[] = [
  { id: 'n1', title: 'Dashboard Setup', type: 'task', status: 'done', tags: ['ui', 'core'] },
  { id: 'n2', title: 'EP-6: TUI Production-Grade', type: 'epic', status: 'in_progress', tags: ['tui', 'ux'] },
  { id: 'n3', title: 'Token Budget widget', type: 'task', status: 'backlog' },
]

describe('compactNode', () => {
  it('formats a node as compact TOON-style line', () => {
    const line = compactNode(nodes[0])
    expect(line).toContain('[task]')
    expect(line).toContain('Dashboard Setup')
    expect(line).toContain('(done)')
    expect(line).toContain('[ui,core]')
  })

  it('omits tags when not present', () => {
    const line = compactNode(nodes[2])
    expect(line).not.toContain('[]')
  })

  it('status color mapping returns expected char', () => {
    // done=✓, in_progress=●, backlog=·, blocked=▲
    expect(compactNode(nodes[0])).toContain('✓')
    expect(compactNode(nodes[1])).toContain('●')
    expect(compactNode(nodes[2])).toContain('·')
  })

  it('includes parent epic hint when type is task', () => {
    const t: CompactableNode = { id: 't1', title: 'Do X', type: 'task', status: 'backlog', parentTitle: 'EP-1' }
    expect(compactNode(t)).toContain('EP-1')
  })
})

describe('compactItems', () => {
  it('joins multiple nodes with newlines', () => {
    const result = compactItems(nodes)
    expect(result.split('\n')).toHaveLength(3)
  })

  it('handles empty array', () => {
    expect(compactItems([])).toBe('')
  })

  it('handles single node', () => {
    const result = compactItems([nodes[0]])
    expect(result).toContain('Dashboard Setup')
  })
})
