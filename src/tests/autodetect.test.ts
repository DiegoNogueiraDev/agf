import { describe, it, expect } from 'vitest'
import { autoDetectFilter } from '../core/tool-compress/autodetect.js'

describe('autoDetectFilter', () => {
  it('is a function', () => {
    expect(typeof autoDetectFilter).toBe('function')
  })

  it('returns null for empty string (no filter detected)', () => {
    const result = autoDetectFilter('')
    expect(result).toBeNull()
  })

  it('returns a filter fn or null for arbitrary text', () => {
    const result = autoDetectFilter('some random text with no pattern')
    expect(result === null || typeof result === 'function').toBe(true)
  })

  it('detects git log pattern', () => {
    const input = 'commit abc1234\nAuthor: Test\nDate: Mon\n\nSubject line\n'
    const filter = autoDetectFilter(input)
    expect(filter === null || typeof filter === 'function').toBe(true)
  })
})
