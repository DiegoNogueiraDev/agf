/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  computeTddScore,
  extractAssertionTypes,
  countAssertions,
  type TddScoreInput,
} from '../core/harness/tdd-score.js'

// ── extractAssertionTypes ───────────────────────────────

describe('extractAssertionTypes', () => {
  it('returns empty array for no assertions', () => {
    expect(extractAssertionTypes('const x = 1')).toEqual([])
  })

  it('detects toBe', () => {
    expect(extractAssertionTypes('expect(x).toBe(1)')).toContain('equality')
  })

  it('detects toEqual', () => {
    expect(extractAssertionTypes('expect(obj).toEqual({})')).toContain('deep-equal')
  })

  it('detects toThrow', () => {
    expect(extractAssertionTypes('expect(fn).toThrow()')).toContain('throw')
  })

  it('detects multiple types', () => {
    const content = `
      expect(x).toBe(1)
      expect(obj).toEqual({})
      expect(arr).toContain('a')
      expect(fn).toThrow()
      expect(val).toBeTruthy()
    `
    const types = extractAssertionTypes(content)
    expect(types.length).toBeGreaterThanOrEqual(4)
    expect(types).toContain('equality')
    expect(types).toContain('deep-equal')
    expect(types).toContain('contains')
    expect(types).toContain('throw')
    expect(types).toContain('truthiness')
  })

  it('deduplicates same type', () => {
    const content = 'expect(a).toBe(1)\nexpect(b).toBe(2)\nexpect(c).toBe(3)'
    const types = extractAssertionTypes(content)
    expect(types.filter((t) => t === 'equality')).toHaveLength(1)
  })
})

// ── countAssertions ─────────────────────────────────────

describe('countAssertions', () => {
  it('returns 0 for no expect calls', () => {
    expect(countAssertions('const x = 1')).toBe(0)
  })

  it('counts expect calls', () => {
    const content = `
      expect(a).toBe(1)
      expect(b).toEqual(2)
      expect(c).toContain('x')
    `
    expect(countAssertions(content)).toBe(3)
  })

  it('handles nested expects', () => {
    const content = 'expect(expect(x).toBe(1)).toBeTruthy()'
    expect(countAssertions(content)).toBe(2)
  })
})

// ── Java / AssertJ / JUnit parsing ──────────────────────

describe('extractAssertionTypes — Java (AssertJ/JUnit)', () => {
  it('detects AssertJ isEqualTo as equality', () => {
    expect(extractAssertionTypes('assertThat(x).isEqualTo(1)')).toContain('equality')
  })

  it('detects JUnit assertEquals as equality', () => {
    expect(extractAssertionTypes('assertEquals(1, x)')).toContain('equality')
  })

  it('detects AssertJ isTrue/isFalse/isNull', () => {
    const content = 'assertThat(a).isTrue();\nassertThat(b).isFalse();\nassertThat(c).isNull();'
    const types = extractAssertionTypes(content)
    expect(types).toContain('truthiness')
    expect(types).toContain('falsy')
    expect(types).toContain('null')
  })

  it('detects JUnit assertThrows and AssertJ isInstanceOf', () => {
    const content =
      'assertThrows(IllegalArgumentException.class, () -> f());\nassertThat(e).isInstanceOf(IOException.class);'
    const types = extractAssertionTypes(content)
    expect(types).toContain('throw')
    expect(types).toContain('instanceof')
  })

  it('recognizes ≥3 distinct AssertJ/JUnit families', () => {
    const content = `
      assertThat(name).isEqualTo("agf");
      assertThat(ready).isTrue();
      assertThat(list).hasSize(3);
      assertThrows(RuntimeException.class, () -> boom());
    `
    const types = extractAssertionTypes(content)
    expect(types.length).toBeGreaterThanOrEqual(3)
  })
})

describe('countAssertions — Java (AssertJ/JUnit)', () => {
  it('counts a single AssertJ chain as one assertion', () => {
    expect(countAssertions('assertThat(x).isEqualTo(1)')).toBe(1)
  })

  it('counts JUnit assert* calls', () => {
    const content = 'assertEquals(1, x);\nassertTrue(y);\nassertThrows(E.class, () -> f());'
    expect(countAssertions(content)).toBe(3)
  })

  it('does not double-count the fluent tail of an AssertJ chain', () => {
    // assertThat(...) is the assertion; .isEqualTo(...) is not a separate one
    expect(countAssertions('assertThat(x).isEqualTo(y).isNotNull()')).toBe(1)
  })
})

describe('Java test file produces a non-zero score (AC: no more 0/0)', () => {
  it('scores a realistic Java test file > 0', () => {
    const java = `
      @Test void resolvesName() {
        assertThat(cfg.name()).isEqualTo("agf");
        assertThat(cfg.ready()).isTrue();
      }
      @Test void rejectsBadInput() {
        assertEquals(2, svc.count());
        assertThrows(IllegalArgumentException.class, () -> svc.parse("x"));
      }
    `
    const totalAssertions = countAssertions(java)
    const assertionTypes = extractAssertionTypes(java)
    const result = computeTddScore({ testFileCount: 1, totalAssertions, assertionTypes })
    expect(totalAssertions).toBeGreaterThan(0)
    expect(result.score).toBeGreaterThan(0)
    expect(result.hasTests).toBe(true)
  })
})

describe('TS/JS parsing stays byte-identical (regression)', () => {
  it('counts expect() exactly as before', () => {
    const ts = "expect(a).toBe(1)\nexpect(b).toEqual({})\nexpect(c).toContain('x')"
    expect(countAssertions(ts)).toBe(3)
  })

  it('extracts the same JS assertion types as before', () => {
    const ts = "expect(a).toBe(1)\nexpect(b).toEqual({})\nexpect(c).toContain('x')"
    expect(extractAssertionTypes(ts).sort()).toEqual(['contains', 'deep-equal', 'equality'])
  })

  it('does not add Java families to a pure JS file', () => {
    const ts = 'expect(fn).toThrow()\nexpect(x).toBeTruthy()'
    const types = extractAssertionTypes(ts)
    expect(types).not.toContain('not-null')
    expect(types.sort()).toEqual(['throw', 'truthiness'])
  })
})

// ── computeTddScore ─────────────────────────────────────

describe('computeTddScore', () => {
  it('returns score 0 when no tests', () => {
    const result = computeTddScore({
      testFileCount: 0,
      totalAssertions: 0,
      assertionTypes: [],
    })
    expect(result.score).toBe(0)
    expect(result.hasTests).toBe(false)
    expect(result.grade).toBe('D')
    expect(result.suggestions.length).toBeGreaterThan(0)
  })

  it('returns score 0 when test files exist but no assertions', () => {
    const result = computeTddScore({
      testFileCount: 2,
      totalAssertions: 0,
      assertionTypes: [],
    })
    expect(result.score).toBe(0)
    expect(result.hasTests).toBe(false)
  })

  it('returns low score for minimal tests', () => {
    const result = computeTddScore({
      testFileCount: 1,
      totalAssertions: 2,
      assertionTypes: ['equality'],
    })
    expect(result.score).toBeGreaterThan(0)
    expect(result.score).toBeLessThan(40)
    expect(result.grade).toBe('D')
    expect(result.suggestions.length).toBeGreaterThan(0)
  })

  it('returns medium score for decent tests', () => {
    const result = computeTddScore({
      testFileCount: 2,
      totalAssertions: 15,
      assertionTypes: ['equality', 'deep-equal', 'throw', 'contains'],
    })
    expect(result.score).toBeGreaterThanOrEqual(50)
    expect(result.score).toBeLessThan(80)
  })

  it('returns high score for thorough tests', () => {
    const result = computeTddScore({
      testFileCount: 3,
      totalAssertions: 35,
      assertionTypes: ['equality', 'deep-equal', 'throw', 'contains', 'truthiness', 'length', 'toMatch'],
      sourceLinesTotal: 200,
      sourceLinesCovered: 180,
    })
    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.grade).toBe('A')
    expect(result.suggestions).toHaveLength(0)
  })

  it('clamps score to 0-100', () => {
    const result = computeTddScore({
      testFileCount: 100,
      totalAssertions: 1000,
      assertionTypes: Array.from({ length: 25 }, (_, i) => `type-${i}`),
      sourceLinesTotal: 10,
      sourceLinesCovered: 10,
    })
    expect(result.score).toBeLessThanOrEqual(100)
    expect(result.score).toBeGreaterThanOrEqual(0)
  })

  it('computes sub-scores', () => {
    const result = computeTddScore({
      testFileCount: 2,
      totalAssertions: 20,
      assertionTypes: ['equality', 'deep-equal', 'throw'],
    })
    expect(result.coverageScore).toBeGreaterThanOrEqual(0)
    expect(result.coverageScore).toBeLessThanOrEqual(100)
    expect(result.diversityScore).toBeGreaterThanOrEqual(0)
    expect(result.diversityScore).toBeLessThanOrEqual(100)
    expect(result.densityScore).toBeGreaterThanOrEqual(0)
    expect(result.densityScore).toBeLessThanOrEqual(100)
  })

  it('suggests actions when score < 60', () => {
    const result = computeTddScore({
      testFileCount: 1,
      totalAssertions: 3,
      assertionTypes: ['equality'],
    })
    expect(result.score).toBeLessThan(60)
    expect(result.suggestions.length).toBeGreaterThan(0)
    expect(result.suggestions.some((s) => s.includes('assertion'))).toBe(true)
  })

  it('no suggestions when score >= 60', () => {
    const result = computeTddScore({
      testFileCount: 3,
      totalAssertions: 30,
      assertionTypes: ['equality', 'deep-equal', 'throw', 'contains', 'truthiness'],
    })
    expect(result.score).toBeGreaterThanOrEqual(60)
    expect(result.suggestions).toHaveLength(0)
  })

  it('penalizes single assertion type', () => {
    const single = computeTddScore({
      testFileCount: 2,
      totalAssertions: 20,
      assertionTypes: ['equality'],
    })
    const diverse = computeTddScore({
      testFileCount: 2,
      totalAssertions: 20,
      assertionTypes: ['equality', 'deep-equal', 'throw', 'contains'],
    })
    expect(single.score).toBeLessThan(diverse.score)
  })
})
