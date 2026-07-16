import { describe, it, expect } from 'vitest'
import { gitDiff } from '../core/tool-compress/filters/gitDiff.js'
import { dedupLog } from '../core/tool-compress/filters/dedupLog.js'
import { find } from '../core/tool-compress/filters/find.js'
import { grep } from '../core/tool-compress/filters/grep.js'

describe('gitDiff', () => {
  it('returns string for empty input', () => {
    expect(typeof gitDiff('')).toBe('string')
  })

  it('extracts filename from diff --git header instead of preserving raw header', () => {
    const input = 'diff --git a/foo.ts b/foo.ts\n@@ -1,1 +1,1 @@\n-const x = 0\n+const x = 1'
    const result = gitDiff(input)
    expect(result).toContain('foo.ts')
    expect(result).not.toContain('diff --git')
  })

  it('shows @@ hunk markers', () => {
    const input = 'diff --git a/foo.ts b/foo.ts\n@@ -1,1 +1,1 @@\n-old\n+new'
    const result = gitDiff(input)
    expect(result).toContain('@@')
  })

  it('counts added and removed lines', () => {
    const input = 'diff --git a/foo.ts b/foo.ts\n@@ -1,1 +1,1 @@\n-old line\n+new line'
    const result = gitDiff(input)
    expect(result).toMatch(/\+1/)
    expect(result).toMatch(/-1/)
  })

  it('truncates at maxLines and adds truncation message', () => {
    const header = 'diff --git a/foo.ts b/foo.ts\n@@ -1,600 +1,600 @@\n'
    const body = '+const x = 1\n'.repeat(600)
    const result = gitDiff(header + body, 10)
    expect(result).toContain('truncated')
  })
})

describe('dedupLog', () => {
  it('returns string', () => {
    expect(typeof dedupLog('')).toBe('string')
  })

  it('collapses consecutive duplicate lines with a summary note', () => {
    const input = 'line A\nline A\nline A\nline B'
    const result = dedupLog(input)
    expect(result).toContain('... (2 duplicate lines)')
    expect(result).toContain('line A')
    expect(result).toContain('line B')
  })

  it('preserves non-consecutive occurrences of the same line', () => {
    const input = 'line A\nline B\nline A'
    const result = dedupLog(input)
    const occurrences = result.split('\n').filter((l) => l === 'line A').length
    expect(occurrences).toBe(2)
  })

  it('preserves unique lines', () => {
    const input = 'line A\nline B\nline C'
    const result = dedupLog(input)
    expect(result).toContain('line A')
    expect(result).toContain('line B')
    expect(result).toContain('line C')
  })
})

describe('find', () => {
  it('returns string', () => {
    expect(typeof find('')).toBe('string')
  })

  it('processes file paths', () => {
    const input = './src/core/foo.ts\n./src/core/bar.ts\n./src/tests/foo.test.ts'
    const result = find(input)
    expect(typeof result).toBe('string')
  })
})

describe('grep', () => {
  it('returns string', () => {
    expect(typeof grep('')).toBe('string')
  })

  it('processes grep output', () => {
    const input = 'src/core/foo.ts:10: export function foo() {\nsrc/core/bar.ts:5: import { foo } from ...'
    const result = grep(input)
    expect(typeof result).toBe('string')
  })
})
