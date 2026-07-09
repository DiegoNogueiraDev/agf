/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { parseMatcher, matches, globMatch } from '../core/hooks/matcher.js'
import type { MatcherAst, HookEventLike } from '../core/hooks/matcher.js'

describe('parseMatcher', () => {
  it('parses channel-only matcher (no parens)', () => {
    const ast = parseMatcher('tool:pre-call')
    expect(ast.channel).toBe('tool:pre-call')
    expect(ast.filters).toEqual([])
  })

  it('parses channel with empty parens', () => {
    const ast = parseMatcher('tool:pre-call()')
    expect(ast.filters).toEqual([])
  })

  it('parses channel with wildcard parens', () => {
    const ast = parseMatcher('task:error(*)')
    expect(ast.filters).toEqual([])
  })

  it('parses glob filter', () => {
    const ast = parseMatcher('tool:pre-call(toolName:Bash)')
    expect(ast.channel).toBe('tool:pre-call')
    expect(ast.filters).toHaveLength(1)
    expect(ast.filters[0].key).toBe('toolName')
    expect(ast.filters[0].kind).toBe('glob')
    expect(ast.filters[0].pattern).toBe('Bash')
  })

  it('parses multiple filters', () => {
    const ast = parseMatcher('tool:pre-call(toolName:Bash,command:npm run *)')
    expect(ast.channel).toBe('tool:pre-call')
    expect(ast.filters).toHaveLength(2)
    expect(ast.filters[0].pattern).toBe('Bash')
    expect(ast.filters[1].pattern).toBe('npm run *')
    expect(ast.filters[1].kind).toBe('glob')
  })

  it('parses numeric comparator filter', () => {
    const ast = parseMatcher('tool:post-call(durationMs:>1000)')
    expect(ast.filters).toHaveLength(1)
    expect(ast.filters[0].kind).toBe('numeric')
    expect(ast.filters[0].comparator).toBe('>')
    expect(ast.filters[0].threshold).toBe(1000)
  })

  it('parses >=, <=, < comparators', () => {
    expect(parseMatcher('ch(d:>=10)').filters[0].comparator).toBe('>=')
    expect(parseMatcher('ch(d:<=10)').filters[0].comparator).toBe('<=')
    expect(parseMatcher('ch(d:<10)').filters[0].comparator).toBe('<')
  })

  it('throws on empty string', () => {
    expect(() => parseMatcher('')).toThrow('Empty matcher')
    expect(() => parseMatcher('   ')).toThrow('Empty matcher')
  })

  it('throws on missing closing paren', () => {
    expect(() => parseMatcher('tool:pre-call(')).toThrow(/missing closing/)
  })

  it('throws on missing channel', () => {
    expect(() => parseMatcher('(filter:val)')).toThrow(/missing channel/)
  })

  it('throws on invalid filter without colon', () => {
    expect(() => parseMatcher('ch(noColon)')).toThrow(/missing ':'/)
  })

  it('throws on empty key in filter', () => {
    expect(() => parseMatcher('ch(:val)')).toThrow(/empty key/)
  })
})

describe('globMatch', () => {
  it('matches exact string', () => {
    expect(globMatch('Bash', 'Bash')).toBe(true)
  })

  it('does not match different strings', () => {
    expect(globMatch('Bash', 'Read')).toBe(false)
  })

  it('matches wildcard', () => {
    expect(globMatch('*', 'anything')).toBe(true)
  })

  it('matches prefix glob', () => {
    expect(globMatch('npm run *', 'npm run test')).toBe(true)
    expect(globMatch('npm run *', 'npm run -- --coverage')).toBe(true)
  })

  it('does not match non-matching glob', () => {
    expect(globMatch('npm run *', 'yarn test')).toBe(false)
  })

  it('matches suffix glob', () => {
    expect(globMatch('*.ts', 'matcher.test.ts')).toBe(true)
    expect(globMatch('*.ts', 'matcher.js')).toBe(false)
  })

  it('escapes regex metacharacters', () => {
    expect(globMatch('file.$path', 'file.$path')).toBe(true)
    expect(globMatch('file(1).txt', 'file(1).txt')).toBe(true)
    expect(globMatch('file(1).txt', 'fileX1Y.txt')).toBe(false)
  })
})

describe('matches', () => {
  it('returns true when channels match and no filters', () => {
    const ast: MatcherAst = { channel: 'tool:pre-call', filters: [] }
    expect(matches(ast, { channel: 'tool:pre-call' })).toBe(true)
  })

  it('returns false when channels mismatch', () => {
    const ast: MatcherAst = { channel: 'tool:pre-call', filters: [] }
    expect(matches(ast, { channel: 'session:start' })).toBe(false)
  })

  it('matches glob filter on payload key', () => {
    const ast = parseMatcher('tool:pre-call(toolName:Bash)')
    expect(matches(ast, { channel: 'tool:pre-call', payload: { toolName: 'Bash' } })).toBe(true)
    expect(matches(ast, { channel: 'tool:pre-call', payload: { toolName: 'Read' } })).toBe(false)
  })

  it('matches numeric filter on payload key', () => {
    const ast = parseMatcher('tool:post-call(durationMs:>1000)')
    expect(matches(ast, { channel: 'tool:post-call', payload: { durationMs: 1500 } })).toBe(true)
    expect(matches(ast, { channel: 'tool:post-call', payload: { durationMs: 500 } })).toBe(false)
  })

  it('matches multiple filters (AND)', () => {
    const ast = parseMatcher('ch(a:>10,b:foo)')
    expect(matches(ast, { channel: 'ch', payload: { a: 20, b: 'foo' } })).toBe(true)
    expect(matches(ast, { channel: 'ch', payload: { a: 20, b: 'bar' } })).toBe(false)
    expect(matches(ast, { channel: 'ch', payload: { a: 5, b: 'foo' } })).toBe(false)
  })

  it('returns false when payload key is missing for glob filter', () => {
    const ast = parseMatcher('tool:pre-call(toolName:Bash)')
    expect(matches(ast, { channel: 'tool:pre-call', payload: {} })).toBe(false)
  })

  it('returns false when payload value is null for glob filter', () => {
    const ast = parseMatcher('tool:pre-call(toolName:Bash)')
    expect(matches(ast, { channel: 'tool:pre-call', payload: { toolName: null } })).toBe(false)
  })

  it('returns false when numeric value is NaN', () => {
    const ast = parseMatcher('ch(d:>10)')
    expect(matches(ast, { channel: 'ch', payload: { d: 'not-a-number' } })).toBe(false)
  })

  it('handles event with undefined payload', () => {
    const ast: MatcherAst = { channel: 'ch', filters: [] }
    expect(matches(ast, { channel: 'ch' })).toBe(true)
  })

  it('handles glob with asterisk in pattern', () => {
    const ast = parseMatcher('ch(cmd:npm run *)')
    expect(matches(ast, { channel: 'ch', payload: { cmd: 'npm run test' } })).toBe(true)
    expect(matches(ast, { channel: 'ch', payload: { cmd: 'npm' } })).toBe(false)
  })
})
