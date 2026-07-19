/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_765dd29fc1cd — C64-T1: tests for compact-format + shortcut-action
 *
 * AC: compactNode formats id+title; compactItems joins with newline;
 *     shortcutAction state machine transitions; tests pass blast gate
 */

import { describe, it, expect } from 'vitest'
import { compactNode, compactItems, type CompactableNode } from '../tui/compact-format.js'
import { shortcutAction } from '../tui/shortcut-action.js'

// ── compactNode ──────────────────────────────────────────────────────────────

const baseNode: CompactableNode = {
  id: 'node_abc',
  title: 'My Task',
  type: 'task',
  status: 'backlog',
}

describe('compactNode', () => {
  it('includes type and title in output', () => {
    const result = compactNode(baseNode)
    expect(result).toContain('[task]')
    expect(result).toContain('My Task')
    expect(result).toContain('backlog')
  })

  it('uses checkmark icon for done status', () => {
    const node = { ...baseNode, status: 'done' }
    expect(compactNode(node)).toContain('✓')
  })

  it('uses filled circle icon for in_progress', () => {
    const node = { ...baseNode, status: 'in_progress' }
    expect(compactNode(node)).toContain('●')
  })

  it('uses triangle icon for blocked', () => {
    const node = { ...baseNode, status: 'blocked' }
    expect(compactNode(node)).toContain('▲')
  })

  it('uses dot icon for backlog (default)', () => {
    const result = compactNode(baseNode)
    expect(result).toContain('·')
  })

  it('includes tags when present', () => {
    const node = { ...baseNode, tags: ['test', 'coverage'] }
    expect(compactNode(node)).toContain('[test,coverage]')
  })

  it('includes parent title with arrow when present', () => {
    const node = { ...baseNode, parentTitle: 'Parent Epic' }
    expect(compactNode(node)).toContain('Parent Epic')
    expect(compactNode(node)).toContain('←')
  })

  it('omits tag section when tags is empty', () => {
    const result = compactNode({ ...baseNode, tags: [] })
    expect(result).not.toMatch(/\[test/)
  })

  it('omits parent section when parentTitle is absent', () => {
    const result = compactNode(baseNode)
    expect(result).not.toContain('←')
  })
})

// ── compactItems ─────────────────────────────────────────────────────────────

describe('compactItems', () => {
  it('returns empty string for empty array', () => {
    expect(compactItems([])).toBe('')
  })

  it('returns single line without newline for one node', () => {
    const result = compactItems([baseNode])
    expect(result).not.toContain('\n')
    expect(result).toContain('My Task')
  })

  it('joins two nodes with a single newline', () => {
    const node2: CompactableNode = { ...baseNode, id: 'node_def', title: 'Second Task' }
    const result = compactItems([baseNode, node2])
    const lines = result.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('My Task')
    expect(lines[1]).toContain('Second Task')
  })

  it('produces N-1 newlines for N nodes', () => {
    const nodes: CompactableNode[] = Array.from({ length: 5 }, (_, i) => ({
      ...baseNode,
      id: `node_${i}`,
      title: `Task ${i}`,
    }))
    const result = compactItems(nodes)
    expect(result.split('\n')).toHaveLength(5)
  })
})

// ── shortcutAction ───────────────────────────────────────────────────────────

describe('shortcutAction.idle', () => {
  it('returns { kind: idle }', () => {
    expect(shortcutAction.idle()).toEqual({ kind: 'idle' })
  })
})

describe('shortcutAction.press — from idle', () => {
  it('d → confirm:delete', () => {
    expect(shortcutAction.press({ kind: 'idle' }, 'd')).toEqual({ kind: 'confirm', action: 'delete' })
  })

  it('c → confirm:consolidate', () => {
    expect(shortcutAction.press({ kind: 'idle' }, 'c')).toEqual({ kind: 'confirm', action: 'consolidate' })
  })

  it('r → executing:refresh immediately (no confirm)', () => {
    expect(shortcutAction.press({ kind: 'idle' }, 'r')).toEqual({ kind: 'executing', action: 'refresh' })
  })

  it('unknown key → stays idle', () => {
    expect(shortcutAction.press({ kind: 'idle' }, 'z')).toEqual({ kind: 'idle' })
  })
})

describe('shortcutAction.press — from confirm', () => {
  const confirmDelete = { kind: 'confirm' as const, action: 'delete' as const }

  it('y → executing', () => {
    expect(shortcutAction.press(confirmDelete, 'y')).toEqual({ kind: 'executing', action: 'delete' })
  })

  it('Y → executing', () => {
    expect(shortcutAction.press(confirmDelete, 'Y')).toEqual({ kind: 'executing', action: 'delete' })
  })

  it('n → idle', () => {
    expect(shortcutAction.press(confirmDelete, 'n')).toEqual({ kind: 'idle' })
  })

  it('N → idle', () => {
    expect(shortcutAction.press(confirmDelete, 'N')).toEqual({ kind: 'idle' })
  })

  it('other key → stays in confirm (same ref)', () => {
    const result = shortcutAction.press(confirmDelete, 'x')
    expect(result).toBe(confirmDelete)
  })
})

describe('shortcutAction.press — from executing', () => {
  it('any key → back to idle', () => {
    const executing = { kind: 'executing' as const, action: 'delete' as const }
    expect(shortcutAction.press(executing, 'anything')).toEqual({ kind: 'idle' })
  })
})

describe('shortcutAction.label', () => {
  it('idle → empty string', () => {
    expect(shortcutAction.label({ kind: 'idle' })).toBe('')
  })

  it('confirm:delete → DELETAR? (y/N)', () => {
    const label = shortcutAction.label({ kind: 'confirm', action: 'delete' })
    expect(label).toContain('DELETAR')
    expect(label).toContain('(y/N)')
  })

  it('confirm:consolidate → CONSOLIDAR? (y/N)', () => {
    const label = shortcutAction.label({ kind: 'confirm', action: 'consolidate' })
    expect(label).toContain('CONSOLIDAR')
    expect(label).toContain('(y/N)')
  })

  it('executing:refresh → REFRESH...', () => {
    const label = shortcutAction.label({ kind: 'executing', action: 'refresh' })
    expect(label).toContain('REFRESH')
  })

  it('executing:delete → DELETE...', () => {
    const label = shortcutAction.label({ kind: 'executing', action: 'delete' })
    expect(label).toContain('DELETE')
  })
})
