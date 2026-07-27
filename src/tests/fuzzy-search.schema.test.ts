import { describe, it, expect } from 'vitest'
import { fuzzySearch, scoreFile } from '../schemas/fuzzy-search.schema.js'

describe('fuzzySearch', () => {
  it('returns empty array for empty query', () => {
    expect(fuzzySearch('', ['src/foo.ts'])).toEqual([])
  })

  it('finds exact matches first', () => {
    const results = fuzzySearch('foo', ['src/foo.ts', 'src/bar.ts', 'src/foobar.ts'])
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].file).toBe('src/foo.ts')
  })

  it('returns scored results', () => {
    const results = fuzzySearch('test', ['src/tests/foo.test.ts', 'src/core/node.ts'])
    expect(results.every((r) => r.score > 0)).toBe(true)
  })

  it('excludes non-matching files', () => {
    const results = fuzzySearch('xyz', ['src/alpha.ts', 'src/beta.ts'])
    expect(results).toEqual([])
  })
})

describe('scoreFile', () => {
  it('returns 1000 for exact match', () => {
    expect(scoreFile('foo.ts', 'foo.ts')).toBe(1000)
  })

  it('returns > 0 for substring match', () => {
    expect(scoreFile('foo', 'src/foo.ts')).toBeGreaterThan(0)
  })

  it('returns 0 for no match', () => {
    expect(scoreFile('xyz', 'abc.ts')).toBe(0)
  })

  it('scores filename match higher than path match', () => {
    const inFilename = scoreFile('foo', 'src/foo.ts')
    const inPath = scoreFile('src', 'src/bar.ts')
    expect(inFilename).toBeGreaterThan(0)
    expect(inPath).toBeGreaterThan(0)
  })
})
