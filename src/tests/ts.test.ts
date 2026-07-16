import { describe, it, expect } from 'vitest'
import { canonicalizeTypeScript, computeContentHash } from '../core/canonicalization/ts.js'

describe('canonicalizeTypeScript', () => {
  it('returns a string for any input', () => {
    expect(typeof canonicalizeTypeScript('const x = 1')).toBe('string')
  })

  it('strips single-line comments', () => {
    const code = 'const x = 1 // this is a comment\nconst y = 2'
    const result = canonicalizeTypeScript(code)
    expect(result).not.toContain('// this is a comment')
    expect(result).toContain('x')
  })

  it('strips multi-line comments', () => {
    const code = '/* multi\nline\ncomment */\nconst z = 3'
    const result = canonicalizeTypeScript(code)
    expect(result).not.toContain('multi')
    expect(result).toContain('z')
  })

  it('code with and without comments canonicalize to same value', () => {
    const withComment = 'const x = 1 // comment'
    const noComment = 'const x = 1'
    expect(canonicalizeTypeScript(withComment)).toBe(canonicalizeTypeScript(noComment))
  })
})

describe('computeContentHash', () => {
  it('returns a 64-character hex string', () => {
    const hash = computeContentHash('hello')
    expect(hash).toHaveLength(64)
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true)
  })

  it('returns same hash for same content', () => {
    const h1 = computeContentHash('test content')
    const h2 = computeContentHash('test content')
    expect(h1).toBe(h2)
  })

  it('returns different hash for different content', () => {
    const h1 = computeContentHash('content A')
    const h2 = computeContentHash('content B')
    expect(h1).not.toBe(h2)
  })

  it('trivial comment removal produces same hash', () => {
    const a = canonicalizeTypeScript('const x = 1 // comment\n')
    const b = canonicalizeTypeScript('const x = 1\n')
    expect(computeContentHash(a)).toBe(computeContentHash(b))
  })
})
