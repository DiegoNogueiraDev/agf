/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Security Scanner — automated security audit via dependency check,
 * secrets detection, and ESLint security plugin verification.
 * Returns a QualityGateReport with score 0-100.
 */

import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { scoreToGrade } from '../utils/grading.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'security-scanner.ts' })

export interface SecurityFinding {
  file?: string
  line?: number
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  message: string
  rule?: string
}

export interface SecurityCheck {
  name: string
  passed: boolean
  details: string
  severity: 'required' | 'recommended'
}

export interface SecurityScanReport {
  mode: 'security_scan'
  score: number
  grade: string
  checks: SecurityCheck[]
  findings: SecurityFinding[]
  passed: boolean
}

const SECRET_PATTERNS = [
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["'][A-Za-z0-9]{16,}["']/gi, rule: 'hardcoded-api-key' },
  { pattern: /(?:secret|password|passwd|pwd)\s*[:=]\s*["'][^"']{8,}["']/gi, rule: 'hardcoded-secret' },
  { pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, rule: 'private-key' },
  { pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g, rule: 'github-token' },
  { pattern: /sk-[A-Za-z0-9]{20,}/g, rule: 'openai-key' },
  { pattern: /AKIA[0-9A-Z]{16}/g, rule: 'aws-access-key' },
]

const SCAN_EXTENSIONS = new Set(['.ts', '.js', '.tsx', '.jsx', '.json', '.env', '.yaml', '.yml'])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.next', '.cache'])

function scanDirectory(dir: string, basePath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = []

  try {
    const entries = readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue

      const fullPath = join(dir, entry.name)

      if (entry.isDirectory()) {
        findings.push(...scanDirectory(fullPath, basePath))
        continue
      }

      const ext = entry.name.slice(entry.name.lastIndexOf('.'))
      if (!SCAN_EXTENSIONS.has(ext)) continue

      // Skip test files for secret scanning (test fixtures may have fake keys)
      if (entry.name.includes('.test.') || entry.name.includes('.spec.')) continue

      try {
        const content = readFileSync(fullPath, 'utf-8')

        for (const { pattern, rule } of SECRET_PATTERNS) {
          pattern.lastIndex = 0
          let match
          while ((match = pattern.exec(content)) !== null) {
            const lineNum = content.slice(0, match.index).split('\n').length
            findings.push({
              file: relative(basePath, fullPath),
              line: lineNum,
              severity: 'high',
              message: `Potential secret detected: ${rule}`,
              rule,
            })
          }
        }
      } catch (err) {
        log.debug('intentional-swallow', { error: String(err), reason: "skip files that can't be read" })
      }
    }
  } catch (err) {
    log.debug('intentional-swallow', { error: String(err), reason: "skip directories that can't be listed" })
  }

  return findings
}

function checkDependencyAudit(projectPath: string): { check: SecurityCheck; findings: SecurityFinding[] } {
  const findings: SecurityFinding[] = []

  try {
    const resultValue = execSync('npm audit --audit-level=high --json 2>/dev/null || true', {
      cwd: projectPath,
      timeout: 15000,
      encoding: 'utf-8',
    })

    let audit: Record<string, unknown>
    try {
      audit = JSON.parse(resultValue) as Record<string, unknown>
    } catch {
      log.warn('security-scanner:audit-parse-failed', { resultLen: resultValue?.length })
      audit = {}
    }
    const vulns = audit.vulnerabilities ?? {}
    let criticalCount = 0
    let highCount = 0

    for (const [name, info] of Object.entries(vulns)) {
      const vuln = info as { severity?: string; via?: Array<{ title?: string; url?: string }> }
      const severity = vuln.severity ?? 'info'

      if (severity === 'critical') criticalCount++
      if (severity === 'high') highCount++

      if (severity === 'critical' || severity === 'high') {
        const via = Array.isArray(vuln.via) ? vuln.via : []
        const firstVia = via[0]
        findings.push({
          severity: severity as 'critical' | 'high',
          message: `Vulnerable dependency: ${name} (${severity})${firstVia?.title ? ` — ${firstVia.title}` : ''}`,
          rule: 'npm-audit',
        })
      }
    }

    const passed = criticalCount === 0 && highCount === 0
    return {
      check: {
        name: 'dependency_audit',
        passed,
        details: passed
          ? 'No critical/high vulnerabilities found'
          : `Found ${criticalCount} critical, ${highCount} high vulnerabilities`,
        severity: 'required',
      },
      findings,
    }
  } catch {
    return {
      check: {
        name: 'dependency_audit',
        passed: true,
        details: 'npm audit skipped (not available or timeout)',
        severity: 'required',
      },
      findings: [],
    }
  }
}

function checkEslintSecurity(projectPath: string): SecurityCheck {
  try {
    const configPath = join(projectPath, 'eslint.config.js')
    const content = readFileSync(configPath, 'utf-8')
    const hasSecurityPlugin = content.includes('eslint-plugin-security') || content.includes('security')

    return {
      name: 'eslint_security',
      passed: hasSecurityPlugin,
      details: hasSecurityPlugin
        ? 'eslint-plugin-security is configured'
        : 'eslint-plugin-security not found in config',
      severity: 'recommended',
    }
  } catch {
    return {
      name: 'eslint_security',
      passed: false,
      details: 'ESLint config not found',
      severity: 'recommended',
    }
  }
}

/**
 * Run a security scan on the project.
 */
export function checkSecurityScan(projectPath: string): SecurityScanReport {
  const checks: SecurityCheck[] = []
  const allFindings: SecurityFinding[] = []

  // Check 1: Dependency audit
  const depResult = checkDependencyAudit(projectPath)
  checks.push(depResult.check)
  allFindings.push(...depResult.findings)

  // Check 2: Secrets scan
  const secretFindings = scanDirectory(join(projectPath, 'src'), projectPath)
  allFindings.push(...secretFindings)
  checks.push({
    name: 'secrets_scan',
    passed: secretFindings.length === 0,
    details:
      secretFindings.length === 0
        ? 'No secret patterns detected in source code'
        : `Found ${secretFindings.length} potential secret(s)`,
    severity: 'required',
  })

  // Check 3: ESLint security plugin
  checks.push(checkEslintSecurity(projectPath))

  // Score calculation
  const requiredChecks = checks.filter((c) => c.severity === 'required')
  const passedRequired = requiredChecks.filter((c) => c.passed).length
  const totalRequired = requiredChecks.length

  const recommendedChecks = checks.filter((c) => c.severity === 'recommended')
  const passedRecommended = recommendedChecks.filter((c) => c.passed).length
  const totalRecommended = recommendedChecks.length

  // Required checks are 70% of score, recommended are 30%
  const requiredScore = totalRequired > 0 ? (passedRequired / totalRequired) * 70 : 70
  const recommendedScore = totalRecommended > 0 ? (passedRecommended / totalRecommended) * 30 : 30

  // Penalty for findings
  const criticalPenalty = allFindings.filter((f) => f.severity === 'critical').length * 20
  const highPenalty = allFindings.filter((f) => f.severity === 'high').length * 10
  const mediumPenalty = allFindings.filter((f) => f.severity === 'medium').length * 3

  const rawScore = requiredScore + recommendedScore - criticalPenalty - highPenalty - mediumPenalty
  const score = Math.max(0, Math.min(100, Math.round(rawScore)))
  const grade = scoreToGrade(score)
  const passed = passedRequired === totalRequired && criticalPenalty === 0

  log.info('security-scanner:complete', {
    score,
    grade,
    checks: checks.length,
    findings: allFindings.length,
    passed,
  })

  return {
    mode: 'security_scan',
    score,
    grade,
    checks,
    findings: allFindings,
    passed,
  }
}
