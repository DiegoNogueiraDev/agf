import { describe, it, expect } from 'vitest'
import { LEARNING_ACTIONS, READ_ONLY_ACTIONS, isReadOnlyAction } from '../core/learning/learning-actions.js'
import type { LearningAction } from '../core/learning/learning-actions.js'

describe('LEARNING_ACTIONS', () => {
  it('is a non-empty array of strings', () => {
    expect(LEARNING_ACTIONS.length).toBeGreaterThan(0)
    LEARNING_ACTIONS.forEach((a) => expect(typeof a).toBe('string'))
  })

  it('includes route, record, stats, explain, export, import', () => {
    expect(LEARNING_ACTIONS).toContain('route')
    expect(LEARNING_ACTIONS).toContain('stats')
    expect(LEARNING_ACTIONS).toContain('export')
  })
})

describe('READ_ONLY_ACTIONS', () => {
  it('is a Set containing only read-only actions', () => {
    expect(READ_ONLY_ACTIONS.has('route')).toBe(true)
    expect(READ_ONLY_ACTIONS.has('stats')).toBe(true)
    expect(READ_ONLY_ACTIONS.has('explain')).toBe(true)
    expect(READ_ONLY_ACTIONS.has('export')).toBe(true)
  })

  it('does not include mutating actions', () => {
    expect(READ_ONLY_ACTIONS.has('record')).toBe(false)
    expect(READ_ONLY_ACTIONS.has('import')).toBe(false)
  })
})

describe('isReadOnlyAction', () => {
  it('returns true for read-only actions', () => {
    const readOnly: LearningAction[] = ['route', 'stats', 'explain', 'export']
    for (const action of readOnly) {
      expect(isReadOnlyAction(action)).toBe(true)
    }
  })

  it('returns false for mutating actions', () => {
    expect(isReadOnlyAction('record')).toBe(false)
    expect(isReadOnlyAction('import')).toBe(false)
  })
})
