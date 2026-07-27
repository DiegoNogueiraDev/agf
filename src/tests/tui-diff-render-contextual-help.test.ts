/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_0307e4a33dc8 — C65-T1: tests for tui diff-render + contextual-help
 *
 * AC: renderEditDiff generates path header + minus/plus lines;
 *     renderPlanDiff concatenates multiple edits;
 *     getContextualHelp returns null for non-empty projects,
 *     view-specific hints for empty graph
 */

import { describe, it, expect } from 'vitest'
import { renderEditDiff, renderPlanDiff, type EditLike } from '../tui/diff-render.js'
import { getContextualHelp } from '../tui/contextual-help.js'

// ── renderEditDiff ───────────────────────────────────────────────────────────

describe('renderEditDiff', () => {
  it('first line is path header', () => {
    const edit: EditLike = { path: 'src/foo.ts', oldString: 'old', newString: 'new' }
    const lines = renderEditDiff(edit)
    expect(lines[0]).toBe('── src/foo.ts ──')
  })

  it('prefixes old lines with -', () => {
    const edit: EditLike = { path: 'x.ts', oldString: 'line1\nline2', newString: '' }
    const lines = renderEditDiff(edit)
    expect(lines[1]).toBe('- line1')
    expect(lines[2]).toBe('- line2')
  })

  it('prefixes new lines with +', () => {
    const edit: EditLike = { path: 'x.ts', oldString: '', newString: 'added\nmore' }
    const lines = renderEditDiff(edit)
    expect(lines[1]).toBe('+ added')
    expect(lines[2]).toBe('+ more')
  })

  it('emits both old and new when both present', () => {
    const edit: EditLike = { path: 'x.ts', oldString: 'old', newString: 'new' }
    const lines = renderEditDiff(edit)
    expect(lines.some((l) => l.startsWith('- '))).toBe(true)
    expect(lines.some((l) => l.startsWith('+ '))).toBe(true)
  })

  it('emits only header when both strings are empty', () => {
    const edit: EditLike = { path: 'x.ts', oldString: '', newString: '' }
    const lines = renderEditDiff(edit)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('x.ts')
  })

  it('returns array (not string)', () => {
    const edit: EditLike = { path: 'x.ts', oldString: 'a', newString: 'b' }
    expect(Array.isArray(renderEditDiff(edit))).toBe(true)
  })
})

// ── renderPlanDiff ───────────────────────────────────────────────────────────

describe('renderPlanDiff', () => {
  it('returns empty array for no edits', () => {
    expect(renderPlanDiff([])).toEqual([])
  })

  it('concatenates diffs for multiple edits', () => {
    const edits: EditLike[] = [
      { path: 'a.ts', oldString: 'old-a', newString: 'new-a' },
      { path: 'b.ts', oldString: 'old-b', newString: 'new-b' },
    ]
    const lines = renderPlanDiff(edits)
    const paths = lines.filter((l) => l.startsWith('── '))
    expect(paths).toHaveLength(2)
    expect(paths[0]).toContain('a.ts')
    expect(paths[1]).toContain('b.ts')
  })

  it('preserves order of edits', () => {
    const edits: EditLike[] = [
      { path: 'first.ts', oldString: '', newString: 'x' },
      { path: 'second.ts', oldString: '', newString: 'y' },
    ]
    const lines = renderPlanDiff(edits)
    const headerLines = lines.filter((l) => l.startsWith('── '))
    expect(headerLines[0]).toContain('first.ts')
    expect(headerLines[1]).toContain('second.ts')
  })
})

// ── getContextualHelp ────────────────────────────────────────────────────────

describe('getContextualHelp', () => {
  it('returns null when totalNodes > 0 (graph has data)', () => {
    expect(getContextualHelp({ totalNodes: 5, view: 'kanban' })).toBeNull()
    expect(getContextualHelp({ totalNodes: 1, view: 'tree' })).toBeNull()
  })

  it('returns kanban hint for empty kanban view', () => {
    const hint = getContextualHelp({ totalNodes: 0, view: 'kanban' })
    expect(hint).not.toBeNull()
    expect(hint).toContain('import-prd')
  })

  it('returns tree hint for empty tree view', () => {
    const hint = getContextualHelp({ totalNodes: 0, view: 'tree' })
    expect(hint).not.toBeNull()
    expect(hint).toContain('wizard')
  })

  it('returns health hint for empty health view', () => {
    const hint = getContextualHelp({ totalNodes: 0, view: 'health' })
    expect(hint).not.toBeNull()
    expect(hint).toContain('saúde')
  })

  it('returns economy hint for empty economy view', () => {
    const hint = getContextualHelp({ totalNodes: 0, view: 'economy' })
    expect(hint).not.toBeNull()
    expect(hint).toContain('economia')
  })

  it('returns generic hint for unknown view', () => {
    const hint = getContextualHelp({ totalNodes: 0, view: 'unknown' as never })
    expect(hint).not.toBeNull()
  })
})
