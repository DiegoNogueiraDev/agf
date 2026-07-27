import { describe, it, expect } from 'vitest'
import { normalize } from '../core/parser/normalize.js'

describe('normalize', () => {
  it('returns a string', () => {
    expect(typeof normalize('hello')).toBe('string')
  })

  it('normalizes CRLF to LF', () => {
    const result = normalize('line1\r\nline2')
    expect(result).not.toContain('\r')
    expect(result).toContain('line1\nline2')
  })

  it('collapses 3+ blank lines to 2', () => {
    const result = normalize('a\n\n\n\nb')
    expect(result).not.toMatch(/\n{3,}/)
  })

  it('converts bullet markers to dash', () => {
    expect(normalize('* item one')).toContain('- item one')
    expect(normalize('• item two')).toContain('- item two')
  })

  it('trims trailing whitespace per line', () => {
    const result = normalize('hello   \nworld  ')
    expect(result).not.toContain('   ')
  })

  it('trims leading and trailing whitespace overall', () => {
    const result = normalize('  \nhello\n  ')
    expect(result).toBe('hello')
  })

  it('passes through already normalized text', () => {
    const clean = 'Hello\nWorld'
    expect(normalize(clean)).toBe(clean)
  })
})
