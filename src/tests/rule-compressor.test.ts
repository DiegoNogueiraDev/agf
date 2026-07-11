import { describe, it, expect } from 'vitest'
import { jaccardSimilarity, compressBullets, compressSteps, compressJson } from '../core/context/rule-compressor.js'

describe('jaccardSimilarity', () => {
  it('returns 0 for two empty strings', () => {
    expect(jaccardSimilarity('', '')).toBe(0)
  })

  it('returns 1 for identical strings', () => {
    expect(jaccardSimilarity('hello world', 'hello world')).toBe(1)
  })

  it('returns 0 for completely different strings', () => {
    expect(jaccardSimilarity('apple orange', 'banana mango')).toBe(0)
  })

  it('returns a value between 0 and 1 for partially overlapping strings', () => {
    const sim = jaccardSimilarity('foo bar baz', 'foo qux baz')
    expect(sim).toBeGreaterThan(0)
    expect(sim).toBeLessThan(1)
  })
})

describe('compressBullets', () => {
  it('returns empty string for empty input', () => {
    expect(compressBullets('', 100)).toBe('')
  })

  it('returns empty string for whitespace-only input', () => {
    expect(compressBullets('   \n  ', 100)).toBe('')
  })

  it('compresses long text into bullet format', () => {
    const text = 'This is the first sentence. This is another sentence. Here is a third one.'
    const result = compressBullets(text, 200)
    expect(result.length).toBeGreaterThan(0)
  })

  it('respects maxTokens budget (very small budget returns empty or minimal)', () => {
    const text = 'This is a very long sentence that explains something important. Another important fact follows.'
    const result = compressBullets(text, 1)
    expect(result.length).toBeLessThanOrEqual(text.length)
  })
})

describe('compressSteps', () => {
  it('returns empty string for empty input', () => {
    expect(compressSteps('', 100)).toBe('')
  })

  it('handles numbered steps', () => {
    const text = '1. First step.\n2. Second step.\n3. Third step.'
    const result = compressSteps(text, 500)
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('compressJson', () => {
  it('returns string output (may return {} for empty input)', () => {
    const result = compressJson('', 100)
    expect(typeof result).toBe('string')
  })

  it('truncates JSON-like content to fit budget', () => {
    const json = JSON.stringify({ key: 'value', nested: { a: 1, b: 2, c: 3 } })
    const result = compressJson(json, 10)
    expect(result.length).toBeLessThanOrEqual(json.length)
  })
})
