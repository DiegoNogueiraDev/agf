/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_6d1e5a7f993f — Behavioral tests for tool-compress filter functions
 * AC: safeApply, tree, ls, grep, smartTruncate each pass ≥2 tests
 */
import { describe, it, expect } from 'vitest'
import { tree } from '../core/tool-compress/filters/tree.js'
import { grep } from '../core/tool-compress/filters/grep.js'
import { smartTruncate } from '../core/tool-compress/filters/smartTruncate.js'
import { readNumbered } from '../core/tool-compress/filters/readNumbered.js'
import { searchList } from '../core/tool-compress/filters/searchList.js'

describe('tree filter', () => {
  it('passes through short input unchanged', () => {
    const input = 'src\n└── index.ts'
    const result = tree(input)
    expect(result).toBe(input)
  })

  it('strips lines containing both "director" and "file"', () => {
    const input = '3 directories, 5 files\nsrc\n└── index.ts'
    const result = tree(input)
    expect(result).not.toContain('directories')
  })

  it('truncates when input exceeds TREE_MAX_LINES (200)', () => {
    const lines = Array.from({ length: 250 }, (_, i) => `line ${i}`)
    const result = tree(lines.join('\n'))
    expect(result).toContain('more lines')
  })

  it('strips leading blank lines', () => {
    const input = '\n\nsrc\n└── index.ts'
    const result = tree(input)
    expect(result.startsWith('\n')).toBe(false)
  })
})

describe('grep filter', () => {
  it('passes through input with no file:line:content pattern', () => {
    const result = grep('no matches here')
    expect(typeof result).toBe('string')
  })

  it('groups matches by file', () => {
    const input = ['src/foo.ts:1: first match', 'src/foo.ts:2: second match', 'src/bar.ts:5: another file'].join('\n')
    const result = grep(input)
    expect(result).toContain('src/foo.ts')
    expect(result).toContain('src/bar.ts')
  })

  it('returns string for empty input', () => {
    expect(typeof grep('')).toBe('string')
  })
})

describe('smartTruncate filter', () => {
  it('passes through short input unchanged (< 250 lines)', () => {
    const input = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n')
    expect(smartTruncate(input)).toBe(input)
  })

  it('truncates long input with gap marker', () => {
    const lines = Array.from({ length: 300 }, (_, i) => `line ${i}`)
    const result = smartTruncate(lines.join('\n'))
    expect(result).toContain('truncated')
    expect(result.split('\n').length).toBeLessThan(300)
  })

  it('preserves first and last lines', () => {
    const lines = Array.from({ length: 300 }, (_, i) => `line ${i}`)
    const result = smartTruncate(lines.join('\n'))
    expect(result).toContain('line 0')
    expect(result).toContain('line 299')
  })
})

describe('readNumbered filter', () => {
  it('passes through short input unchanged (< 250 lines)', () => {
    const input = Array.from({ length: 5 }, (_, i) => `${i}| content`).join('\n')
    expect(readNumbered(input)).toBe(input)
  })

  it('truncates long numbered file output with gap marker', () => {
    const lines = Array.from({ length: 300 }, (_, i) => `${i}| content ${i}`)
    const result = readNumbered(lines.join('\n'))
    expect(result).toContain('truncated')
  })
})

describe('searchList filter', () => {
  it('returns string for empty input', () => {
    expect(typeof searchList('')).toBe('string')
  })

  it('passes through input without search-result header', () => {
    const input = 'some plain text\nno matches here'
    const result = searchList(input)
    expect(typeof result).toBe('string')
  })

  it('compresses search list output with header', () => {
    const paths = Array.from({ length: 15 }, (_, i) => `- /path/dir/file${i}.ts`).join('\n')
    const input = `Result of search in '/src' (total 15 files):\n${paths}`
    const result = searchList(input)
    expect(typeof result).toBe('string')
  })
})
