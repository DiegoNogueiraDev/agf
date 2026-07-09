/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { scanTestCoverage } from '../core/harness/test-coverage-scanner.js'

describe('scanTestCoverage', () => {
  it('all modules tested → testScore 100', () => {
    const r = scanTestCoverage(
      ['foo', 'bar'],
      [
        { name: 'foo.test.ts', hasAssertions: true },
        { name: 'bar.test.ts', hasAssertions: true },
      ],
    )
    expect(r.testScore).toBe(100)
    expect(r.testedModules).toBe(2)
    expect(r.emptyTests).toBe(0)
  })

  it('no modules tested → testScore 0', () => {
    const r = scanTestCoverage(['foo', 'bar'], [])
    expect(r.testScore).toBe(0)
    expect(r.testedModules).toBe(0)
  })

  it('half tested → score 50', () => {
    const r = scanTestCoverage(['foo', 'bar'], [{ name: 'foo.test.ts', hasAssertions: true }])
    expect(r.testScore).toBe(50)
    expect(r.testedModules).toBe(1)
  })

  it('empty module list → testScore 100', () => {
    const r = scanTestCoverage([], [])
    expect(r.testScore).toBe(100)
    expect(r.totalModules).toBe(0)
  })

  it('handles dash/underscore normalization', () => {
    const r = scanTestCoverage(
      ['my-module', 'other_module'],
      [
        { name: 'my_module.test.ts', hasAssertions: true },
        { name: 'other-module.test.ts', hasAssertions: true },
      ],
    )
    expect(r.testScore).toBe(100)
  })

  it('counts empty tests separately', () => {
    const r = scanTestCoverage(['foo', 'bar'], [{ name: 'foo.test.ts', hasAssertions: false }])
    expect(r.testScore).toBe(0)
    expect(r.emptyTests).toBe(1)
  })

  it('collectViolations returns missing_test details', () => {
    const r = scanTestCoverage(['foo'], [], { collectViolations: true })
    expect(r.violations).toBeDefined()
    expect(r.violations!.length).toBe(1)
    expect(r.violations![0].violationType).toBe('missing_test')
  })

  it('collectViolations returns empty_test details', () => {
    const r = scanTestCoverage(['foo'], [{ name: 'foo.test.ts', hasAssertions: false }], { collectViolations: true })
    expect(r.violations).toBeDefined()
    expect(r.violations!.length).toBe(1)
    expect(r.violations![0].violationType).toBe('empty_test')
  })
})
