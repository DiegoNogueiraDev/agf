/*!
 * TDD tests for safe-regexp.ts — ReDoS/injection guard.
 *
 * AC1: Known ReDoS pattern → rejected (safeCompileRegex returns null), never executed.
 * AC2: Invalid regex → returns null (typed error path), no crash.
 * AC3: Valid patterns compile normally.
 */

import { describe, it, expect } from 'vitest'
import { safeCompileRegex, safeCompileRegexes } from '../core/utils/safe-regexp.js'

describe('safeCompileRegex — ReDoS patterns (AC1)', () => {
  it('rejects nested quantifier pattern (a+)+', () => {
    expect(safeCompileRegex('(a+)+')).toBeNull()
  })

  it('rejects nested quantifier pattern (a*)* ', () => {
    expect(safeCompileRegex('(a*)*')).toBeNull()
  })

  it('rejects pattern exceeding max length', () => {
    const longPattern = 'a'.repeat(501)
    expect(safeCompileRegex(longPattern)).toBeNull()
  })

  it('rejects deeply nested alternation that causes ReDoS', () => {
    // (a|aa)+ is a known catastrophic pattern
    expect(safeCompileRegex('(a|aa)+')).toBeNull()
  })
})

describe('safeCompileRegex — invalid regex (AC2)', () => {
  it('returns null for syntactically invalid regex, no crash', () => {
    expect(safeCompileRegex('[unclosed')).toBeNull()
  })

  it('returns null for empty string', () => {
    // empty string compiles to /(?:)/ — valid but pathological in policy context
    // We allow it since it's harmless
    const result = safeCompileRegex('')
    // either null or a valid RegExp — no crash
    expect(result === null || result instanceof RegExp).toBe(true)
  })
})

describe('safeCompileRegex — valid patterns (AC3)', () => {
  it('compiles simple literal pattern', () => {
    const re = safeCompileRegex('hello')
    expect(re).toBeInstanceOf(RegExp)
    expect(re?.test('hello world')).toBe(true)
  })

  it('compiles anchored pattern', () => {
    const re = safeCompileRegex('^git ')
    expect(re).toBeInstanceOf(RegExp)
    expect(re?.test('git commit')).toBe(true)
    expect(re?.test('echo git')).toBe(false)
  })

  it('compiles character class pattern', () => {
    const re = safeCompileRegex('[a-z]+')
    expect(re).toBeInstanceOf(RegExp)
  })

  it('compiles simple alternation without nesting', () => {
    const re = safeCompileRegex('foo|bar')
    expect(re).toBeInstanceOf(RegExp)
  })
})

describe('safeCompileRegexes — batch compilation', () => {
  it('skips invalid patterns and compiles valid ones', () => {
    const results = safeCompileRegexes(['(a+)+', 'valid', '[unclosed'])
    expect(results).toHaveLength(1)
    expect(results[0].source).toBe('valid')
  })
})
