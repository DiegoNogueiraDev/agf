/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for src/core/canonicalization/ — TypeScript canonicalization for stable hashing
 */
import { describe, it, expect } from 'vitest'
import { canonicalizeTypeScript, computeContentHash } from '../core/canonicalization/ts.js'

describe('canonicalizeTypeScript', () => {
  it('removes single-line comments', () => {
    const input = '// this is a comment\nconst x = 1'
    const result = canonicalizeTypeScript(input)
    expect(result).not.toContain('comment')
    expect(result).toContain('const x = 1')
  })

  it('removes block comments', () => {
    const input = '/* block * /\nconst y = 2'
    const result = canonicalizeTypeScript(input)
    expect(result).toContain('const y = 2')
  })

  it('normalizes whitespace and blank lines', () => {
    const input = '\n\n  const a = 1  \n\n\n  const b = 2  \n\n'
    const result = canonicalizeTypeScript(input)
    expect(result).not.toMatch(/\n\n/)
    expect(result).toContain('const a = 1')
    expect(result).toContain('const b = 2')
  })

  it('normalizes line endings (CRLF → LF)', () => {
    const input = 'const a = 1\r\nconst b = 2\r\n'
    const result = canonicalizeTypeScript(input)
    expect(result).not.toContain('\r')
  })

  it('strips trailing whitespace from each line', () => {
    const input = 'const a = 1   \nconst b = 2   '
    const result = canonicalizeTypeScript(input)
    expect(result).toContain('const a = 1\nconst b = 2')
  })

  it('returns trimmed empty string for only comments', () => {
    const input = '// just a comment\n/* another */'
    const result = canonicalizeTypeScript(input)
    expect(result).toBe('')
  })

  it('preserves meaningful code through transformations', () => {
    const input = `
      // SPDX header
      import { z } from 'zod/v4'

      /* Block
         comment */
      export const schema = z.object({
        name: z.string(),
      })
    `
    const result = canonicalizeTypeScript(input)
    expect(result).toContain("import { z } from 'zod/v4'")
    expect(result).toContain('export const schema = z.object({')
    expect(result).toContain('name: z.string(),')
    expect(result).not.toContain('SPDX')
    expect(result).not.toContain('comment')
  })

  it('handles strings with unusual unicode and special characters', () => {
    const input = 'const x = "hello 🔥 world \\n \\t"'
    const result = canonicalizeTypeScript(input)
    expect(result).toContain('🔥')
    expect(result).toContain('hello')
  })
})

describe('computeContentHash', () => {
  it('returns 64-char hex sha256 string', () => {
    const hash = computeContentHash('const x = 1')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('produces same hash for equivalent content with different whitespace', () => {
    const a = 'const x = 1'
    const b = '  const x = 1  \n\n'
    expect(computeContentHash(a)).toBe(computeContentHash(b))
  })

  it('produces same hash for content with and without comments', () => {
    const withComments = '// header\nconst x = 1 /* inline */'
    const withoutComments = 'const x = 1'
    expect(computeContentHash(withComments)).toBe(computeContentHash(withoutComments))
  })

  it('produces different hash for semantically different content', () => {
    const a = 'const x = 1'
    const b = 'const x = 2'
    expect(computeContentHash(a)).not.toBe(computeContentHash(b))
  })

  it('deterministic across multiple calls', () => {
    const input = 'function foo() { return 42 }'
    const h1 = computeContentHash(input)
    const h2 = computeContentHash(input)
    expect(h1).toBe(h2)
  })

  it('handles empty string', () => {
    const hash = computeContentHash('')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })
})
