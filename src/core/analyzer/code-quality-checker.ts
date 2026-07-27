/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Code Quality Checker — automated code quality audit via lint, typecheck,
 * and convention compliance. Returns a QualityGateReport with score 0-100.
 */

import { execSync } from 'node:child_process'
import { McpGraphError } from '../utils/errors.js'
import { scoreToGrade } from '../utils/grading.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'code-quality-checker.ts' })

export interface QualityCheck {
  name: string
  passed: boolean
  details: string
  severity: 'required' | 'recommended'
}

export interface QualityFinding {
  file?: string
  line?: number
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  message: string
  rule?: string
}

export interface CodeQualityReport {
  mode: 'code_quality'
  score: number
  grade: string
  checks: QualityCheck[]
  findings: QualityFinding[]
  passed: boolean
}

function runLint(projectPath: string): { check: QualityCheck; findings: QualityFinding[] } {
  const findings: QualityFinding[] = []

  try {
    execSync('npm run lint 2>&1', { cwd: projectPath, timeout: 15000, encoding: 'utf-8' })
    return {
      check: { name: 'lint', passed: true, details: 'ESLint passed with zero errors', severity: 'required' },
      findings: [],
    }
  } catch (err) {
    const output = (err as { stdout?: string }).stdout ?? String(err)
    const errorMatch = output.match(/(\d+) error/)
    const warningMatch = output.match(/(\d+) warning/)
    const errors = errorMatch ? parseInt(errorMatch[1], 10) : 0
    const warnings = warningMatch ? parseInt(warningMatch[1], 10) : 0

    if (errors > 0) {
      findings.push({ severity: 'high', message: `ESLint: ${errors} error(s), ${warnings} warning(s)`, rule: 'eslint' })
    }

    return {
      check: {
        name: 'lint',
        passed: errors === 0,
        details: `ESLint: ${errors} error(s), ${warnings} warning(s)`,
        severity: 'required',
      },
      findings,
    }
  }
}

function runTypecheck(projectPath: string): QualityCheck {
  try {
    execSync('npm run typecheck 2>&1', { cwd: projectPath, timeout: 15000, encoding: 'utf-8' })
    return { name: 'type_safety', passed: true, details: 'TypeScript typecheck passed', severity: 'required' }
  } catch (err) {
    const output = String((err as { stdout?: string }).stdout ?? err)
    const errorMatch = output.match(/Found (\d+) error/)
    const errorCount = errorMatch ? parseInt(errorMatch[1], 10) : 1
    return {
      name: 'type_safety',
      passed: false,
      details: `TypeScript: ${errorCount} error(s)`,
      severity: 'required',
    }
  }
}

/**
 * Run a code quality check on the project.
 */
export function checkCodeQuality(projectPath: string): CodeQualityReport {
  if (!projectPath) {
    throw new McpGraphError('Code quality check requires a valid project path')
  }
  const checks: QualityCheck[] = []
  const allFindings: QualityFinding[] = []

  // Check 1: Lint
  const lintResult = runLint(projectPath)
  checks.push(lintResult.check)
  allFindings.push(...lintResult.findings)

  // Check 2: Typecheck
  checks.push(runTypecheck(projectPath))

  // Score calculation
  const requiredChecks = checks.filter((c) => c.severity === 'required')
  const passedRequired = requiredChecks.filter((c) => c.passed).length
  const totalRequired = requiredChecks.length

  const score = totalRequired > 0 ? Math.round((passedRequired / totalRequired) * 100) : 100
  const grade = scoreToGrade(score)
  const passed = passedRequired === totalRequired

  log.info('code-quality:complete', { score, grade, passed })

  return { mode: 'code_quality', score, grade, checks, findings: allFindings, passed }
}
