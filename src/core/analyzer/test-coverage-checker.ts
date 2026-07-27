/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Test Coverage Checker — automated test suite validation and coverage analysis.
 * Returns a QualityGateReport with score 0-100.
 */

import { execSync } from 'node:child_process'
import { scoreToGrade } from '../utils/grading.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'test-coverage-checker.ts' })

export interface CoverageCheck {
  name: string
  passed: boolean
  details: string
  severity: 'required' | 'recommended'
}

export interface TestCoverageReport {
  mode: 'test_coverage'
  score: number
  grade: string
  checks: CoverageCheck[]
  findings: Array<{ severity: 'critical' | 'high' | 'medium' | 'low' | 'info'; message: string; rule?: string }>
  testCount: number
  coveragePercent: number
  passed: boolean
}

function runTestSuite(projectPath: string): { check: CoverageCheck; testCount: number; allPassed: boolean } {
  try {
    const output = execSync('npx vitest run 2>&1', { cwd: projectPath, timeout: 120000, encoding: 'utf-8' })
    const passedMatch = output.match(/(\d+) passed/)
    const failedMatch = output.match(/(\d+) failed/)
    const passed = failedMatch ? parseInt(failedMatch[1], 10) === 0 : true
    const testCount = passedMatch ? parseInt(passedMatch[1], 10) : 0

    return {
      check: {
        name: 'test_suite',
        passed,
        details: passed ? `All ${testCount} tests passed` : `${failedMatch?.[1] ?? '?'} test(s) failed`,
        severity: 'required',
      },
      testCount,
      allPassed: passed,
    }
  } catch (err) {
    const output = String((err as { stdout?: string }).stdout ?? err)
    const failedMatch = output.match(/(\d+) failed/)
    const passedMatch = output.match(/(\d+) passed/)

    return {
      check: {
        name: 'test_suite',
        passed: false,
        details: `${failedMatch?.[1] ?? '?'} test(s) failed, ${passedMatch?.[1] ?? '?'} passed`,
        severity: 'required',
      },
      testCount: passedMatch ? parseInt(passedMatch[1], 10) : 0,
      allPassed: false,
    }
  }
}

/**
 * Run test coverage analysis on the project.
 */
export function checkTestCoverage(projectPath: string): TestCoverageReport {
  const checks: CoverageCheck[] = []
  const findings: Array<{ severity: 'critical' | 'high' | 'medium' | 'low' | 'info'; message: string; rule?: string }> =
    []

  // Check 1: Test suite passes
  const suiteResult = runTestSuite(projectPath)
  checks.push(suiteResult.check)

  if (!suiteResult.allPassed) {
    findings.push({ severity: 'critical', message: 'Test suite has failures', rule: 'test_suite' })
  }

  // Check 2: Test count health
  const testCountHealthy = suiteResult.testCount >= 100
  checks.push({
    name: 'test_count',
    passed: testCountHealthy,
    details: `${suiteResult.testCount} tests (minimum: 100)`,
    severity: 'recommended',
  })

  // Score calculation
  const requiredPassed = checks.filter((c) => c.severity === 'required' && c.passed).length
  const requiredTotal = checks.filter((c) => c.severity === 'required').length
  const recommendedPassed = checks.filter((c) => c.severity === 'recommended' && c.passed).length
  const recommendedTotal = checks.filter((c) => c.severity === 'recommended').length

  const requiredScore = requiredTotal > 0 ? (requiredPassed / requiredTotal) * 70 : 70
  const recommendedScore = recommendedTotal > 0 ? (recommendedPassed / recommendedTotal) * 30 : 30

  const score = Math.max(0, Math.min(100, Math.round(requiredScore + recommendedScore)))
  const grade = scoreToGrade(score)
  const passed = requiredPassed === requiredTotal

  log.info('test-coverage:complete', { score, grade, testCount: suiteResult.testCount, passed })

  return {
    mode: 'test_coverage',
    score,
    grade,
    checks,
    findings,
    testCount: suiteResult.testCount,
    coveragePercent: 0, // Would need --coverage run for actual percent
    passed,
  }
}
