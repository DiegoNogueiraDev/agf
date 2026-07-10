/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { dedupLog } from '../core/tool-compress/filters/dedupLog.js'
import { readNumbered } from '../core/tool-compress/filters/readNumbered.js'
import { searchList } from '../core/tool-compress/filters/searchList.js'
import { buildOutput } from '../core/tool-compress/filters/buildOutput.js'
import { smartTruncate } from '../core/tool-compress/filters/smartTruncate.js'

describe('dedupLog', () => {
  it('removes consecutive duplicate lines', () => {
    const input = 'a\nb\nb\nb\nc\nc\nd'
    const out = dedupLog(input)
    expect(out).toContain('a')
    expect(out).toContain('b')
    expect(out).toContain('... (2 duplicate lines)')
    expect(out).toContain('c')
    expect(out).toContain('... (1 duplicate lines)')
    expect(out).toContain('d')
  })

  it('collapses blank line streaks', () => {
    const input = 'a\n\n\n\n\nb'
    const out = dedupLog(input)
    expect(out).not.toMatch(/\n\n\n/) // max 1 blank
    expect(out).toMatch(/a\n\nb/)
  })

  it('returns original for empty input', () => {
    expect(dedupLog('')).toBe('')
  })

  it('handles single line', () => {
    expect(dedupLog('hello')).toBe('hello')
  })

  it('no duplicates passes through', () => {
    const input = 'a\nb\nc\nd\ne'
    expect(dedupLog(input)).toBe(input)
  })
})

describe('readNumbered', () => {
  it('returns original for short input', () => {
    const input = '  1|hello\n  2|world'
    expect(readNumbered(input)).toBe(input)
  })

  it('collapses long numbered file keeping head+tail', () => {
    const lines: string[] = []
    for (let i = 1; i <= 500; i++) lines.push(`  ${i}|line ${i}`)
    const input = lines.join('\n')
    const out = readNumbered(input)
    const outLines = out.split('\n')

    expect(outLines[0]).toContain('1|')
    expect(outLines.length).toBeLessThan(250)
    expect(out).toContain('... +')
    expect(out).toContain('lines truncated')
  })
})

describe('searchList', () => {
  it('groups search results by directory', () => {
    const input = "Result of search in 'test' (total 5 files):\n- src/a.ts\n- src/b.ts\n- lib/c.ts"
    const out = searchList(input)
    expect(out).toContain('src/')
    expect(out).toContain('lib/')
    expect(out).toContain('a.ts')
    expect(out).toContain('c.ts')
  })

  it('returns original for non-matching header', () => {
    expect(searchList('just some text')).toBe('just some text')
  })

  it('caps per-dir results', () => {
    const items: string[] = ["Result of search in 'test' (total 20 files):"]
    for (let i = 0; i < 20; i++) items.push(`- src/file${i}.ts`)
    const input = items.join('\n')
    const out = searchList(input)
    expect(out).toContain('file0')
    const file9Lines = (out.match(/file\d+/g) || []).length
    expect(file9Lines).toBeLessThan(20)
  })

  it('handles empty body', () => {
    expect(searchList("Result of search in 'test' (total 0 files):")).toBe(
      "Result of search in 'test' (total 0 files):",
    )
  })
})

describe('buildOutput', () => {
  it('extracts npm errors and warnings', () => {
    const input =
      'npm ERR! code ELIFECYCLE\nnpm ERR! errno 1\nnpm warn deprecated pkg@1.0.0\nadded 10 packages\nCompiling something...\nFinished in 2.3s'
    const out = buildOutput(input)
    expect(out).toContain('npm ERR')
    expect(out).toContain('deprecated')
    expect(out).toContain('added 10 packages')
    expect(out).not.toContain('Compiling something')
  })

  it('keeps cargo-style error blocks', () => {
    const input = 'error[E0308]: mismatched types\n --> src/main.rs:10:5\n  |\n1 | let x: i32 = "hello";\n  |'
    const out = buildOutput(input)
    expect(out).toContain('error[E0308]')
    expect(out).toContain('src/main.rs')
  })

  it('returns original for short output', () => {
    const input = 'ok'
    expect(buildOutput(input)).toBe('ok')
  })

  it('extracts BUILD FAILED', () => {
    const input = '[ERROR] Task failed\nBUILD FAILED\nFinished in 1.0s'
    const out = buildOutput(input)
    expect(out).toContain('[ERROR]')
    expect(out).toContain('BUILD FAILED')
  })

  it('preserves BUILD SUCCESS summary', () => {
    const input = 'Compiling pkg-a\nCompiling pkg-b\nBUILD SUCCESS\nFinished in 30s'
    const out = buildOutput(input)
    expect(out).toContain('Compiled 2 packages')
    expect(out).toContain('BUILD SUCCESS')
  })
})

describe('smartTruncate', () => {
  function makeLines(n: number): string {
    return Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n')
  }

  it('returns original for short text', () => {
    const input = makeLines(100)
    expect(smartTruncate(input)).toBe(input)
  })

  it('preserves head and tail for long text', () => {
    const input = makeLines(500)
    const out = smartTruncate(input)
    expect(out).toContain('line 1')
    expect(out).toContain('line 500')
    expect(out).toContain('lines truncated')
    const outLines = out.split('\n')
    expect(outLines.length).toBeLessThan(250)
  })

  it('marks truncated lines count', () => {
    const input = makeLines(300)
    const out = smartTruncate(input)
    const match = out.match(/\.\.\. \+(\d+) lines truncated/)
    expect(match).toBeTruthy()
    expect(Number(match![1])).toBeGreaterThan(0)
  })
})
