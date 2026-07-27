import { describe, it, expect } from 'vitest'
import { searchList, SEARCH_LIST_HEADER_RE } from '../core/tool-compress/filters/searchList.js'

describe('SEARCH_LIST_HEADER_RE', () => {
  it('matches a search result header', () => {
    const line = "Result of search in 'src' (total 12 files):"
    expect(SEARCH_LIST_HEADER_RE.test(line)).toBe(true)
  })

  it('captures the file count', () => {
    const line = "Result of search in '/project' (total 5 files):"
    const match = SEARCH_LIST_HEADER_RE.exec(line)
    expect(match).not.toBeNull()
    expect(match![1]).toBe('5')
  })

  it('matches singular file count', () => {
    const line = "Result of search in 'src' (total 1 file):"
    expect(SEARCH_LIST_HEADER_RE.test(line)).toBe(true)
  })

  it('does not match unrelated text', () => {
    expect(SEARCH_LIST_HEADER_RE.test('some random text')).toBe(false)
  })
})

describe('searchList', () => {
  it('has filterName property', () => {
    expect(searchList.filterName).toBe('search-list')
  })

  it('returns input unchanged when no - prefixed paths', () => {
    const input = 'Just some text\nwithout file listings'
    expect(searchList(input)).toBe(input)
  })

  it('returns a string for any input', () => {
    expect(typeof searchList('')).toBe('string')
    expect(typeof searchList('- /some/path.ts')).toBe('string')
  })

  it('processes input with file path lines', () => {
    const header = "Result of search in 'src' (total 3 files):"
    const input = [header, '- src/a/file1.ts', '- src/a/file2.ts', '- src/b/file3.ts'].join('\n')
    const result = searchList(input)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('groups files by directory', () => {
    const input = [
      "Result of search in '.' (total 4 files):",
      '- src/core/file1.ts',
      '- src/core/file2.ts',
      '- src/tests/file3.ts',
      '- src/tests/file4.ts',
    ].join('\n')
    const result = searchList(input)
    expect(result).toContain('src/core')
    expect(result).toContain('src/tests')
  })
})
