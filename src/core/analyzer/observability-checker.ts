/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Observability Checker — validates logging coverage, structured logging,
 * and error handling across the codebase. Returns a QualityGateReport with score 0-100.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { scoreToGrade } from '../utils/grading.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'observability-checker.ts' })

export interface ObservabilityCheck {
  name: string
  passed: boolean
  details: string
  severity: 'required' | 'recommended'
}

export interface ObservabilityReport {
  mode: 'observability_check'
  score: number
  grade: string
  checks: ObservabilityCheck[]
  findings: Array<{
    file?: string
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
    message: string
    rule?: string
  }>
  gaps: string[]
  passed: boolean
}

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', 'web', 'dashboard'])

function getSourceFiles(dir: string, basePath: string): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = []

  try {
    const entries = readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue

      const fullPath = join(dir, entry.name)

      if (entry.isDirectory()) {
        files.push(...getSourceFiles(fullPath, basePath))
        continue
      }

      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts')) continue

      try {
        files.push({ path: relative(basePath, fullPath), content: readFileSync(fullPath, 'utf-8') })
      } catch (err) {
        log.debug('intentional-swallow', { error: String(err), reason: 'skip unreadable file' })
      }
    }
  } catch (err) {
    log.debug('intentional-swallow', { error: String(err), reason: 'skip unreadable directory' })
  }

  return files
}

/**
 * Run observability check on the project.
 */
export function checkObservability(projectPath: string): ObservabilityReport {
  const checks: ObservabilityCheck[] = []
  const findings: Array<{
    file?: string
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
    message: string
    rule?: string
  }> = []
  const gaps: string[] = []

  const srcPath = join(projectPath, 'src')
  const coreFiles = getSourceFiles(join(srcPath, 'core'), projectPath)
  const mcpFiles = getSourceFiles(join(srcPath, 'mcp'), projectPath)
  const allFiles = [...coreFiles, ...mcpFiles]

  // Check 1: Logger coverage
  const filesWithLogger = allFiles.filter((f) => f.content.includes('logger.'))
  const filesWithoutLogger = allFiles.filter((f) => !f.content.includes('logger.') && f.content.includes('export '))
  const loggerCoverage = allFiles.length > 0 ? filesWithLogger.length / allFiles.length : 1

  for (const fVar of filesWithoutLogger.slice(0, 10)) {
    gaps.push(fVar.path)
  }

  checks.push({
    name: 'logger_coverage',
    passed: loggerCoverage >= 0.6,
    details: `${Math.round(loggerCoverage * 100)}% of source files use logger (${filesWithLogger.length}/${allFiles.length})`,
    severity: 'required',
  })

  // Check 2: No console.log in production code
  const filesWithConsole = allFiles.filter(
    (f) => /\bconsole\.(log|warn|error|info|debug)\b/.test(f.content) && !f.path.includes('logger.ts'), // logger.ts itself is allowed
  )

  checks.push({
    name: 'structured_logging',
    passed: filesWithConsole.length === 0,
    details:
      filesWithConsole.length === 0
        ? 'No console.log in production code'
        : `${filesWithConsole.length} file(s) use console.log instead of logger`,
    severity: 'recommended',
  })

  for (const fVar of filesWithConsole) {
    findings.push({
      file: fVar.path,
      severity: 'medium',
      message: 'Uses console.log instead of structured logger',
      rule: 'no-console',
    })
  }

  // Check 3: Error handling coverage
  const filesWithCatch = allFiles.filter((f) => f.content.includes('catch'))
  const filesWithCatchAndLog = filesWithCatch.filter((f) => /catch[\s\S]*?logger\.(error|warn)/.test(f.content))
  const errorCoverage = filesWithCatch.length > 0 ? filesWithCatchAndLog.length / filesWithCatch.length : 1

  checks.push({
    name: 'error_handling',
    passed: errorCoverage >= 0.5,
    details: `${Math.round(errorCoverage * 100)}% of catch blocks log errors (${filesWithCatchAndLog.length}/${filesWithCatch.length})`,
    severity: 'recommended',
  })

  // Score calculation
  const requiredChecks = checks.filter((c) => c.severity === 'required')
  const passedRequired = requiredChecks.filter((c) => c.passed).length
  const totalRequired = requiredChecks.length

  const recommendedChecks = checks.filter((c) => c.severity === 'recommended')
  const passedRecommended = recommendedChecks.filter((c) => c.passed).length
  const totalRecommended = recommendedChecks.length

  const requiredScore = totalRequired > 0 ? (passedRequired / totalRequired) * 70 : 70
  const recommendedScore = totalRecommended > 0 ? (passedRecommended / totalRecommended) * 30 : 30
  const score = Math.max(0, Math.min(100, Math.round(requiredScore + recommendedScore)))
  const grade = scoreToGrade(score)
  const passed = passedRequired === totalRequired

  log.info('observability:complete', { score, grade, loggerCoverage: Math.round(loggerCoverage * 100), passed })

  return { mode: 'observability_check', score, grade, checks, findings, gaps, passed }
}
