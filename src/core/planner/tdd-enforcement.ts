/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * TDD Enforcement — verifies that test commits precede code commits.
 *
 * Pure function — takes commit history as input, no git I/O.
 * Integrates with finish_task strict mode to block test-after-code patterns.
 *
 * Three outcomes per file:
 *   exempt    — matches declarative whitelist (types, schemas, *.d.ts)
 *   same-commit — test + code in same commit → warning only
 *   violation — code has no preceding or co-located test commit → blocked in strict
 */

import { minimatch } from 'minimatch'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'tdd-enforcement.ts' })

export interface CommitInfo {
  hash: string
  timestamp: string
  files: string[]
}

export interface TddEnforcementContext {
  touchedFiles: string[]
  commitHistory: CommitInfo[]
  mode: 'strict' | 'advisory' | 'off'
  declarativeWhitelist?: string[]
}

export interface TddEnforcementResult {
  blocked: boolean
  mode: 'strict' | 'advisory' | 'off'
  violations: string[]
  warnings: string[]
  exempted: string[]
}

/** Default glob patterns for files that never need a preceding test commit */
export const DEFAULT_DECLARATIVE_WHITELIST: string[] = [
  '**/*.d.ts',
  '**/*.types.ts',
  '**/types.ts',
  '**/types/**',
  '**/schemas/**',
  '**/*.schema.ts',
  '**/index.ts',
]

function isDeclarative(file: string, whitelist: string[]): boolean {
  return whitelist.some((pattern) => minimatch(file, pattern, { dot: true }))
}

function isTestFile(file: string): boolean {
  return /\.test\.[tj]sx?$|\.spec\.[tj]sx?$|__tests__/.test(file)
}

function stripExtension(file: string): string {
  return file.replace(/\.test\.[tj]sx?$|\.spec\.[tj]sx?$/, '').replace(/\.[tj]sx?$/, '')
}

/** Whether a test file covers a given code file by name proximity */
function testCoversFile(testFile: string, codeFile: string): boolean {
  const codeStem = stripExtension(codeFile)
  const testStem = stripExtension(testFile)
  // e.g. src/core/foo.ts → src/tests/foo.test.ts
  // Match by base-name or by stem ending
  const codeBase = codeStem.split('/').pop() ?? ''
  const testBase = testStem.split('/').pop() ?? ''
  return testBase.endsWith(codeBase) || testBase === codeBase || testStem.includes(codeBase)
}

/** checkTddEnforcement —  */
export function checkTddEnforcement(ctx: TddEnforcementContext): TddEnforcementResult {
  const { touchedFiles, commitHistory, mode, declarativeWhitelist = [] } = ctx

  const base: TddEnforcementResult = {
    blocked: false,
    mode,
    violations: [],
    warnings: [],
    exempted: [],
  }

  if (mode === 'off') {
    log.debug('tdd_enforcement:off', { fileCount: touchedFiles.length })
    return base
  }

  // Sort commits by timestamp ascending (oldest first)
  const sorted = [...commitHistory].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  const violations: string[] = []
  const warnings: string[] = []
  const exempted: string[] = []

  for (const codeFile of touchedFiles) {
    // Skip test files themselves and non-TS/JS files
    if (isTestFile(codeFile)) continue

    // Exempt declarative files
    if (isDeclarative(codeFile, declarativeWhitelist)) {
      exempted.push(codeFile)
      continue
    }

    // Find the commit(s) that introduced this code file
    const codeCommits = sorted.filter((c) => c.files.includes(codeFile))
    if (codeCommits.length === 0) {
      // File not in any commit → skip (may be unstaged)
      continue
    }

    const firstCodeCommit = codeCommits[0]

    // Check if a test covers this file in the SAME commit
    const sameCommitTest = firstCodeCommit.files.some((f) => isTestFile(f) && testCoversFile(f, codeFile))

    if (sameCommitTest) {
      warnings.push(
        `"${codeFile}" and its test are in the same commit (${firstCodeCommit.hash.slice(0, 7)}). ` +
          'For stricter TDD, write the test first in a separate commit.',
      )
      continue
    }

    // Check if any PRECEDING commit contains a covering test
    const firstCodeTs = new Date(firstCodeCommit.timestamp).getTime()
    const hasPrecedingTest = sorted.some((c) => {
      if (new Date(c.timestamp).getTime() >= firstCodeTs) return false
      return c.files.some((f) => isTestFile(f) && testCoversFile(f, codeFile))
    })

    if (hasPrecedingTest) {
      continue // Green — test first ✓
    }

    // No test found: violation
    violations.push(codeFile)
  }

  log.warn('tdd_enforcement:check', {
    mode,
    violations: violations.length,
    warnings: warnings.length,
    exempted: exempted.length,
  })

  const blocked = mode === 'strict' && violations.length > 0

  return { blocked, mode, violations, warnings, exempted }
}
