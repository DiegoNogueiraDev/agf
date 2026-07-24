import { describe, it, expect } from 'vitest'
import { tree } from '../core/tool-compress/filters/tree.js'

describe('tree filter', () => {
  it('returns input unchanged for short input', () => {
    const input = 'src/\n  core/\n  tests/'
    expect(tree(input)).toBe(input)
  })

  it('strips leading blank lines', () => {
    const input = '\n\nfoo/\n  bar.ts'
    const result = tree(input)
    expect(result.startsWith('\n')).toBe(false)
  })

  it('strips trailing blank lines', () => {
    const input = 'foo/\n  bar.ts\n\n\n'
    const result = tree(input)
    expect(result.endsWith('\n')).toBe(false)
  })

  it('truncates very long tree output and adds continuation marker', () => {
    const longInput = Array.from({ length: 500 }, (_, i) => `  file${i}.ts`).join('\n')
    const result = tree(longInput)
    expect(result).toContain('more lines')
  })

  it('returns empty string for empty input', () => {
    expect(tree('')).toBe('')
  })
})
