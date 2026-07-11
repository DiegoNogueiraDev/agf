import { describe, it, expect } from 'vitest'
import { getContextualHelp } from '../tui/contextual-help.js'

describe('getContextualHelp', () => {
  it('returns null when totalNodes > 0', () => {
    expect(getContextualHelp({ totalNodes: 1, view: 'kanban' })).toBeNull()
    expect(getContextualHelp({ totalNodes: 100, view: 'tree' })).toBeNull()
  })

  it('returns help text for kanban view when empty', () => {
    const result = getContextualHelp({ totalNodes: 0, view: 'kanban' })
    expect(result).toContain('import-prd')
  })

  it('returns help text for tree view when empty', () => {
    const result = getContextualHelp({ totalNodes: 0, view: 'tree' })
    expect(result).toContain('wizard')
  })

  it('returns help text for health view when empty', () => {
    const result = getContextualHelp({ totalNodes: 0, view: 'health' })
    expect(typeof result).toBe('string')
    expect(result).not.toBeNull()
  })

  it('returns help text for economy view when empty', () => {
    const result = getContextualHelp({ totalNodes: 0, view: 'economy' })
    expect(typeof result).toBe('string')
  })

  it('returns a string for unknown view when empty', () => {
    const result = getContextualHelp({ totalNodes: 0, view: 'unknown' as never })
    expect(result).not.toBeNull()
  })

  it('returns null regardless of view when totalNodes > 0', () => {
    for (const view of ['kanban', 'tree', 'health', 'economy'] as const) {
      expect(getContextualHelp({ totalNodes: 5, view })).toBeNull()
    }
  })
})
