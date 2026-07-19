/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Task 5.2: Wire semantic coverage scanner into project-quality harness score.
 * AC1 — evaluateProjectQuality includes importCoverageRatio in the report.
 * AC2 — 5 stem-matched modules, only 3 import → phantomCoverageCount = 2.
 * AC3 — importCoverageRatio < stemCoverageRatio → penalty applied + phantomCoverage advisory.
 */

import { describe, it, expect } from 'vitest'
import { evaluateProjectQuality } from '../core/harness/project-quality.js'
import type { SourceFile } from '../core/harness/logging-coverage-scanner.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeModule(name: string): SourceFile {
  return {
    path: `src/core/${name}.ts`,
    content: `export function ${name}() { /* log: ${name} ready */ }`,
  }
}

function makeTestImporting(name: string): SourceFile {
  return {
    path: `src/tests/${name}.test.ts`,
    content: `import { ${name} } from '../core/${name}.js'\ndescribe('${name}', () => { it('works', () => { expect(${name}()).toBeDefined() }) })`,
  }
}

function makeTestNotImporting(name: string): SourceFile {
  return {
    path: `src/tests/${name}.test.ts`,
    content: `describe('${name}', () => { it('exists', () => { expect(true).toBe(true) }) })`,
  }
}

// ── AC1 ───────────────────────────────────────────────────────────────────────

describe('T5.2 AC1: evaluateProjectQuality includes importCoverageRatio', () => {
  it('result contains importCoverageRatio as a number', () => {
    const files: SourceFile[] = [makeModule('alpha'), makeTestImporting('alpha')]
    const result = evaluateProjectQuality(files)
    expect(typeof result.importCoverageRatio).toBe('number')
  })

  it('importCoverageRatio is between 0 and 100', () => {
    const files: SourceFile[] = [makeModule('alpha'), makeTestImporting('alpha')]
    const result = evaluateProjectQuality(files)
    expect(result.importCoverageRatio).toBeGreaterThanOrEqual(0)
    expect(result.importCoverageRatio).toBeLessThanOrEqual(100)
  })
})

// ── AC2 ───────────────────────────────────────────────────────────────────────

describe('T5.2 AC2: 5 stem-matched modules, 3 actually import → phantomCoverageCount = 2', () => {
  it('phantomCoverageCount is 2 when 5 have stem-matched tests but only 3 import', () => {
    const files: SourceFile[] = [
      // 5 modules
      makeModule('mod-a'),
      makeModule('mod-b'),
      makeModule('mod-c'),
      makeModule('mod-d'),
      makeModule('mod-e'),
      // 3 test files that actually import their module
      makeTestImporting('mod-a'),
      makeTestImporting('mod-b'),
      makeTestImporting('mod-c'),
      // 2 test files that exist (stem match) but DON'T import the module
      makeTestNotImporting('mod-d'),
      makeTestNotImporting('mod-e'),
    ]
    const result = evaluateProjectQuality(files)
    expect(result.phantomCoverageCount).toBe(2)
  })

  it('phantomCoverageCount is 0 when all test files import their module', () => {
    const files: SourceFile[] = [makeModule('widget'), makeTestImporting('widget')]
    const result = evaluateProjectQuality(files)
    expect(result.phantomCoverageCount).toBe(0)
  })
})

// ── AC3 ───────────────────────────────────────────────────────────────────────

describe('T5.2 AC3: importCoverageRatio < stemCoverageRatio → penalty + advisory', () => {
  it('advisories includes phantomCoverage when phantom gap > 0', () => {
    const files: SourceFile[] = [
      makeModule('alpha'),
      makeModule('beta'),
      // stem-match tests but alpha doesn't import
      makeTestNotImporting('alpha'),
      makeTestImporting('beta'),
    ]
    const result = evaluateProjectQuality(files)
    expect(Array.isArray(result.advisories)).toBe(true)
    expect(result.advisories).toContain('phantomCoverage')
  })

  it('semanticScore is lower than testScore when phantom gap > 0', () => {
    const files: SourceFile[] = [
      makeModule('alpha'),
      makeModule('beta'),
      makeTestNotImporting('alpha'),
      makeTestImporting('beta'),
    ]
    const result = evaluateProjectQuality(files)
    expect(result.semanticScore).toBeLessThanOrEqual(result.testScore)
  })

  it('no phantomCoverage advisory when all modules are import-covered', () => {
    const files: SourceFile[] = [makeModule('alpha'), makeTestImporting('alpha')]
    const result = evaluateProjectQuality(files)
    expect(result.advisories?.includes('phantomCoverage')).toBe(false)
  })
})
