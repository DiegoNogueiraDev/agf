/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Test Coverage Scanner — Harnessability Metric dimension
 *
 * Counts source modules that have corresponding test files with assertions.
 * Score: (tested modules / total modules) * 100.
 *
 * Part of the Harnessability Metric (Harness Engineering).
 * v4: Optional collectViolations mode returns file-level ViolationDetail[].
 */

import type { ViolationDetail } from './violation-detail.js'

export interface TestCoverageResult {
  testScore: number
  totalModules: number
  testedModules: number
  emptyTests: number
  /** File-level violations — only present when collectViolations=true */
  violations?: ViolationDetail[]
}

export interface TestFileInfo {
  name: string
  hasAssertions: boolean
}

export interface TestCoverageOptions {
  /** When true, collect file-level violations. Default: false */
  collectViolations?: boolean
}

/**
 * Scan test coverage: match module names to test file names.
 * Only counts test files with assertions (hasAssertions=true) as covered.
 */
export function scanTestCoverage(
  moduleNames: string[],
  testFiles: TestFileInfo[],
  options?: TestCoverageOptions,
): TestCoverageResult {
  if (moduleNames.length === 0) {
    return {
      testScore: 100,
      totalModules: 0,
      testedModules: 0,
      emptyTests: 0,
      ...(options?.collectViolations ? { violations: [] } : {}),
    }
  }

  const collect = options?.collectViolations === true
  const violations: ViolationDetail[] = []

  // Build set of test stems with assertions
  const testedStems = new Set<string>()
  const emptyStems = new Set<string>()
  let emptyTests = 0

  for (const tf of testFiles) {
    const stem = tf.name
      .replace(/\.test\.tsx$/, '')
      .replace(/\.test\.ts$/, '')
      .replace(/\.bench\.ts$/, '')
    if (tf.hasAssertions) {
      testedStems.add(stem)
    } else {
      emptyTests++
      emptyStems.add(stem)
    }
  }

  // Match modules to tests
  let testedModules = 0
  for (const mod of moduleNames) {
    const matched =
      testedStems.has(mod) || testedStems.has(mod.replace(/_/g, '-')) || testedStems.has(mod.replace(/-/g, '_'))

    if (matched) {
      testedModules++
    } else if (collect) {
      const hasEmpty =
        emptyStems.has(mod) || emptyStems.has(mod.replace(/_/g, '-')) || emptyStems.has(mod.replace(/-/g, '_'))

      if (hasEmpty) {
        violations.push({
          file: `src/tests/${mod}.test.ts`,
          line: 1,
          dimension: 'tests',
          violationType: 'empty_test',
          evidence: `Test file for ${mod} has 0 assertions`,
          confidence: 0.9,
        })
      } else {
        violations.push({
          file: mod,
          line: 1,
          dimension: 'tests',
          violationType: 'missing_test',
          evidence: `No test file found for module ${mod}`,
          confidence: 1.0,
        })
      }
    }
  }

  const testScore = Math.round((testedModules / moduleNames.length) * 100)

  return {
    testScore,
    totalModules: moduleNames.length,
    testedModules,
    emptyTests,
    ...(collect ? { violations } : {}),
  }
}
