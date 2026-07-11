/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Task 5.3: Flag skipped/only tests as regression risk in harness output.
 * AC1 — skippedTestCount matches actual .skip( occurrences across test files.
 * AC2 — skippedTestCount > 0 → advisory emitted.
 * AC3 — zero skipped tests → no skipped-test advisory.
 */

import { describe, it, expect } from 'vitest'
import { evaluateProjectQuality } from '../core/harness/project-quality.js'
import type { SourceFile } from '../core/harness/logging-coverage-scanner.js'

// ── AC1 ───────────────────────────────────────────────────────────────────────

describe('T5.3 AC1: skippedTestCount matches actual .skip( annotations', () => {
  it('counts 1 skipped test across test files', () => {
    const files: SourceFile[] = [
      { path: 'src/core/alpha.ts', content: 'export function alpha() { /* log */ }' },
      {
        path: 'src/tests/alpha.test.ts',
        content: `
describe('alpha', () => {
  it.skip('should do something', () => {})
  it('actually works', () => { expect(1).toBe(1) })
})
`,
      },
    ]
    const result = evaluateProjectQuality(files)
    expect(result.skippedTestCount).toBe(1)
  })

  it('counts 3 skipped tests across multiple files', () => {
    const files: SourceFile[] = [
      { path: 'src/core/alpha.ts', content: 'export function alpha() { /* log */ }' },
      { path: 'src/core/beta.ts', content: 'export function beta() { /* log */ }' },
      {
        path: 'src/tests/alpha.test.ts',
        content: `it.skip('test a', () => {})\nit.skip('test b', () => {})\nit('ok', () => {})`,
      },
      {
        path: 'src/tests/beta.test.ts',
        content: `describe.skip('all', () => { it('test c', () => {}) })`,
      },
    ]
    const result = evaluateProjectQuality(files)
    expect(result.skippedTestCount).toBe(3)
  })

  it('returns skippedTestCount = 0 when no .skip() annotations', () => {
    const files: SourceFile[] = [
      { path: 'src/core/alpha.ts', content: 'export function alpha() { /* log */ }' },
      {
        path: 'src/tests/alpha.test.ts',
        content: `it('works', () => { expect(1).toBe(1) })`,
      },
    ]
    const result = evaluateProjectQuality(files)
    expect(result.skippedTestCount).toBe(0)
  })
})

// ── AC2 ───────────────────────────────────────────────────────────────────────

describe('T5.3 AC2: skippedTestCount > 0 → advisory emitted', () => {
  it('advisories includes skipped-test message when .skip() annotations exist', () => {
    const files: SourceFile[] = [
      { path: 'src/core/alpha.ts', content: 'export function alpha() { /* log */ }' },
      {
        path: 'src/tests/alpha.test.ts',
        content: `it.skip('skipped test', () => {})`,
      },
    ]
    const result = evaluateProjectQuality(files)
    expect(Array.isArray(result.advisories)).toBe(true)
    const skippedAdvisory = result.advisories.find((a) => a.includes('skipped'))
    expect(skippedAdvisory).toBeDefined()
    expect(skippedAdvisory).toMatch(/\d+.*skipped/)
  })

  it('advisory message includes the count of skipped tests', () => {
    const files: SourceFile[] = [
      { path: 'src/core/alpha.ts', content: 'export function alpha() { /* log */ }' },
      {
        path: 'src/tests/alpha.test.ts',
        content: `it.skip('a', () => {})\nit.skip('b', () => {})`,
      },
    ]
    const result = evaluateProjectQuality(files)
    const advisory = result.advisories.find((a) => a.includes('skipped'))
    expect(advisory).toContain('2')
  })
})

// ── AC3 ───────────────────────────────────────────────────────────────────────

describe('T5.3 AC3: zero skipped tests → no skipped-test advisory', () => {
  it('no skipped advisory when test files have no .skip() annotations', () => {
    const files: SourceFile[] = [
      { path: 'src/core/alpha.ts', content: 'export function alpha() { /* log */ }' },
      { path: 'src/tests/alpha.test.ts', content: `it('works', () => { expect(1).toBe(1) })` },
    ]
    const result = evaluateProjectQuality(files)
    const skippedAdvisory = result.advisories.find((a) => a.includes('skipped'))
    expect(skippedAdvisory).toBeUndefined()
  })

  it('skippedTestCount field is always present (even when 0)', () => {
    const result = evaluateProjectQuality([])
    expect(typeof result.skippedTestCount).toBe('number')
    expect(result.skippedTestCount).toBe(0)
  })
})
