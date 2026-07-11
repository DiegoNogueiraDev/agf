import { describe, it, expect } from 'vitest'
import { fmtElapsed, statusIcon, padRight, fmtSummary } from '../skills/shared/handler-utils.js'

describe('fmtElapsed', () => {
  it('formats ms below 1s', () => {
    expect(fmtElapsed(500)).toBe('500ms')
  })

  it('formats seconds', () => {
    expect(fmtElapsed(5000)).toBe('5s')
  })

  it('formats minutes and seconds', () => {
    expect(fmtElapsed(90000)).toBe('1m30s')
  })

  it('returns non-empty string for 0ms', () => {
    expect(fmtElapsed(0)).toBe('0ms')
  })
})

describe('statusIcon', () => {
  it('returns checkmark for done', () => {
    expect(statusIcon('done')).toBe('✓')
  })

  it('returns arrow for in_progress', () => {
    expect(statusIcon('in_progress')).toBe('→')
  })

  it('returns a string for any status', () => {
    for (const s of ['done', 'in_progress', 'backlog', 'blocked', 'ready'] as const) {
      expect(typeof statusIcon(s)).toBe('string')
    }
  })
})

describe('padRight', () => {
  it('pads string to target length', () => {
    expect(padRight('hi', 5)).toBe('hi   ')
  })

  it('returns string unchanged if already >= target length', () => {
    expect(padRight('hello', 3)).toBe('hello')
  })

  it('returns same string if exactly target length', () => {
    expect(padRight('abc', 3)).toBe('abc')
  })
})

describe('fmtSummary', () => {
  it('formats key-value pairs with = and · separator', () => {
    expect(fmtSummary({ a: 1, b: 'x' })).toBe('a=1 · b=x')
  })

  it('returns empty string for empty input', () => {
    expect(fmtSummary({})).toBe('')
  })
})
