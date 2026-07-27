import { describe, it, expect } from 'vitest'
import { grep } from '../core/tool-compress/filters/grep.js'

const SAMPLE_GREP = [
  'src/core/foo.ts:12:const x = 1',
  'src/core/foo.ts:15:const y = 2',
  'src/core/bar.ts:3:export function hello()',
].join('\n')

describe('grep', () => {
  it('returns string', () => {
    expect(typeof grep(SAMPLE_GREP)).toBe('string')
  })

  it('returns input unchanged for empty string', () => {
    expect(grep('')).toBe('')
  })

  it('returns input unchanged when no file:line:content pattern', () => {
    const plain = 'just some text'
    expect(grep(plain)).toBe(plain)
  })

  it('includes match count summary', () => {
    const result = grep(SAMPLE_GREP)
    expect(result).toContain('3 matches')
  })

  it('includes file names', () => {
    const result = grep(SAMPLE_GREP)
    expect(result).toContain('foo.ts')
    expect(result).toContain('bar.ts')
  })

  it('includes file count', () => {
    const result = grep(SAMPLE_GREP)
    expect(result).toContain('2F')
  })

  it('includes line content', () => {
    const result = grep(SAMPLE_GREP)
    expect(result).toContain('const x = 1')
  })
})
