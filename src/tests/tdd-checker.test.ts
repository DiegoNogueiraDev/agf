import { describe, it, expect } from 'vitest'
import { generateTddHintsFromTexts } from '../core/implementer/tdd-checker.js'

describe('generateTddHintsFromTexts', () => {
  it('returns empty array for empty input', () => {
    const hints = generateTddHintsFromTexts([])
    expect(hints).toEqual([])
  })

  it('returns array for a single AC text', () => {
    const hints = generateTddHintsFromTexts(['function returns error for null input'])
    expect(Array.isArray(hints)).toBe(true)
  })

  it('returns hints for multiple AC texts', () => {
    const hints = generateTddHintsFromTexts(['validates email format', 'returns 400 for invalid input'])
    expect(Array.isArray(hints)).toBe(true)
  })

  it('each hint is an object', () => {
    const hints = generateTddHintsFromTexts(['returns non-empty string'])
    for (const h of hints) {
      expect(typeof h).toBe('object')
      expect(h).not.toBeNull()
    }
  })
})
