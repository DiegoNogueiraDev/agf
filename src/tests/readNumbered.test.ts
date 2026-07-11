import { describe, it, expect } from 'vitest'
import { readNumbered } from '../core/tool-compress/filters/readNumbered.js'

const MIN_LINES = 250

function makeLines(n: number): string {
  return Array.from({ length: n }, (_, i) => `${i + 1}|content of line ${i + 1}`).join('\n')
}

describe('readNumbered', () => {
  it('returns input unchanged when below min lines threshold', () => {
    const short = makeLines(100)
    expect(readNumbered(short)).toBe(short)
  })

  it('truncates long input and includes truncation marker', () => {
    const input = makeLines(MIN_LINES + 1)
    const result = readNumbered(input)
    expect(result).toContain('truncated')
    expect(result.split('\n').length).toBeLessThan(MIN_LINES + 1)
  })

  it('preserves first few lines (head)', () => {
    const input = makeLines(MIN_LINES + 50)
    const result = readNumbered(input)
    expect(result).toContain('1|content of line 1')
  })

  it('preserves last few lines (tail)', () => {
    const totalLines = MIN_LINES + 50
    const input = makeLines(totalLines)
    const result = readNumbered(input)
    expect(result).toContain(`${totalLines}|content of line ${totalLines}`)
  })
})
