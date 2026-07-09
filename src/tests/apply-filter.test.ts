import { describe, it, expect } from 'vitest'
import { safeApply } from '../core/tool-compress/apply-filter.js'

describe('safeApply', () => {
  it('returns input unchanged when fn is null', () => {
    expect(safeApply(null, 'hello')).toBe('hello')
  })

  it('returns input unchanged when fn is undefined', () => {
    expect(safeApply(undefined, 'hello')).toBe('hello')
  })

  it('applies the function to the text', () => {
    const upper = (t: string) => t.toUpperCase()
    expect(safeApply(upper, 'hello')).toBe('HELLO')
  })

  it('returns original text if fn throws', () => {
    const throws = () => {
      throw new Error('panic')
    }
    expect(safeApply(throws, 'fallback')).toBe('fallback')
  })

  it('returns original text if fn returns non-string', () => {
    const returnsNumber = () => 42 as unknown as string
    expect(safeApply(returnsNumber, 'original')).toBe('original')
  })

  it('passes empty string through', () => {
    const id = (t: string) => t
    expect(safeApply(id, '')).toBe('')
  })
})
