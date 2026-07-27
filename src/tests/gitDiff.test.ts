import { describe, it, expect } from 'vitest'
import { gitDiff } from '../core/tool-compress/filters/gitDiff.js'

describe('gitDiff', () => {
  it('returns string for empty input', () => {
    expect(typeof gitDiff('')).toBe('string')
  })

  it('extracts filename from diff --git header', () => {
    const input = 'diff --git a/foo.ts b/foo.ts\n@@ -1,1 +1,1 @@\n-old\n+new'
    const result = gitDiff(input)
    expect(result).toContain('foo.ts')
    expect(result).not.toContain('diff --git')
  })

  it('shows @@ hunk markers', () => {
    const input = 'diff --git a/foo.ts b/foo.ts\n@@ -1,3 +1,3 @@\n-a\n+b'
    const result = gitDiff(input)
    expect(result).toContain('@@')
  })

  it('counts added and removed lines', () => {
    const input = 'diff --git a/foo.ts b/foo.ts\n@@ -1,2 +1,2 @@\n-old1\n-old2\n+new1\n+new2'
    const result = gitDiff(input)
    expect(result).toMatch(/\+2/)
    expect(result).toMatch(/-2/)
  })

  it('truncates at maxLines and adds message', () => {
    const header = 'diff --git a/big.ts b/big.ts\n@@ -1,600 +1,600 @@\n'
    const body = '+x = 1\n'.repeat(600)
    const result = gitDiff(header + body, 10)
    expect(result).toContain('truncated')
  })
})
