import { describe, it, expect } from 'vitest'
import { canonicalizeTypeScript, computeContentHash } from '../core/canonicalization/ts.js'

describe('canonicalizeTypeScript', () => {
  it('returns empty string for empty input', () => {
    expect(canonicalizeTypeScript('')).toBe('')
  })

  it('normalizes trailing whitespace', () => {
    const withTrailing = 'const x = 1   \nconst y = 2   '
    const clean = 'const x = 1\nconst y = 2'
    expect(canonicalizeTypeScript(withTrailing)).toBe(canonicalizeTypeScript(clean))
  })

  it('strips single-line comments', () => {
    const withComment = 'const x = 1 // this is a comment\nconst y = 2'
    const without = 'const x = 1\nconst y = 2'
    expect(canonicalizeTypeScript(withComment)).toBe(canonicalizeTypeScript(without))
  })

  it('produces same hash for functionally equivalent code', () => {
    const a = 'function foo() { return 1 } // version A'
    const b = 'function foo() { return 1 } // version B'
    expect(canonicalizeTypeScript(a)).toBe(canonicalizeTypeScript(b))
  })

  it('preserves meaningful code structure', () => {
    const code = 'export function foo(x: number): number { return x + 1 }'
    const result = canonicalizeTypeScript(code)
    expect(result).toContain('foo')
    expect(result).toContain('return x + 1')
  })

  it('handles pathological input gracefully', () => {
    expect(() => canonicalizeTypeScript('/* unclosed')).not.toThrow()
  })
})

describe('computeContentHash', () => {
  it('returns a 64-char hex string', () => {
    const hash = computeContentHash('hello world')
    expect(hash).toHaveLength(64)
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true)
  })

  it('is deterministic', () => {
    const content = 'const x = 42'
    expect(computeContentHash(content)).toBe(computeContentHash(content))
  })

  it('differs for different content', () => {
    expect(computeContentHash('abc')).not.toBe(computeContentHash('def'))
  })

  it('returns same hash for canonically equivalent TS', () => {
    const a = 'const x = 1 // comment A'
    const b = 'const x = 1 // comment B'
    const hashA = computeContentHash(canonicalizeTypeScript(a))
    const hashB = computeContentHash(canonicalizeTypeScript(b))
    expect(hashA).toBe(hashB)
  })
})
