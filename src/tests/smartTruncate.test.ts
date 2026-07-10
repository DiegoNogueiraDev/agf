import { describe, it, expect } from 'vitest'
import { smartTruncate } from '../core/tool-compress/filters/smartTruncate.js'

const TRUNCATE_MIN = 250

function makeLines(n: number): string {
  return Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n')
}

describe('smartTruncate', () => {
  it('returns input unchanged when below SMART_TRUNCATE_MIN_LINES', () => {
    const short = makeLines(100)
    expect(smartTruncate(short)).toBe(short)
  })

  it('truncates input at SMART_TRUNCATE_MIN_LINES + 1 lines', () => {
    const input = makeLines(TRUNCATE_MIN + 1)
    const result = smartTruncate(input)
    expect(result).toContain('truncated')
    expect(result.split('\n').length).toBeLessThan(TRUNCATE_MIN + 1)
  })

  it('preserves first head lines', () => {
    const input = makeLines(TRUNCATE_MIN + 50)
    const result = smartTruncate(input)
    expect(result).toContain('line 1')
  })

  it('preserves last tail lines', () => {
    const totalLines = TRUNCATE_MIN + 50
    const input = makeLines(totalLines)
    const result = smartTruncate(input)
    expect(result).toContain(`line ${totalLines}`)
  })
})
