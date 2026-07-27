import { describe, it, expect } from 'vitest'
import { find } from '../core/tool-compress/filters/find.js'

const SAMPLE_FIND = ['src/core/foo.ts', 'src/core/bar.ts', 'src/tests/foo.test.ts'].join('\n')

describe('find', () => {
  it('returns string', () => {
    expect(typeof find(SAMPLE_FIND)).toBe('string')
  })

  it('returns input for empty string', () => {
    expect(find('')).toBe('')
  })

  it('includes total file count', () => {
    const result = find(SAMPLE_FIND)
    expect(result).toContain('3 files')
  })

  it('includes directory grouping', () => {
    const result = find(SAMPLE_FIND)
    expect(result).toContain('src/core/')
  })

  it('includes file basenames', () => {
    const result = find(SAMPLE_FIND)
    expect(result).toContain('foo.ts')
  })

  it('handles single file', () => {
    const result = find('README.md')
    expect(result).toContain('1 files')
  })
})
