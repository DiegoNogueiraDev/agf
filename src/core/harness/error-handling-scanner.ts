/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Error Handling Scanner — Harnessability Metric dimension (v2)
 *
 * Detects poor error-handling patterns in TypeScript files:
 * - Raw throws: bare `Error` constructions in files that don't import typed errors
 * - Swallowed catches: empty catch blocks (no logger call, no rethrow)
 * - console.error/warn usage outside test/bench files (should use logger)
 *
 * Score = max(0, 100 - badSites * 20)
 * v4: Optional collectViolations mode returns file-level ViolationDetail[].
 */

import type { FileContent } from './type-coverage-scanner.js'
import type { ViolationDetail } from './violation-detail.js'

export interface ErrorHandlingResult {
  errorHandlingScore: number
  totalErrorSites: number
  rawThrows: number
  swallowedCatches: number
  consoleErrors: number
  /** File-level violations — only present when collectViolations=true */
  violations?: ViolationDetail[]
}

export interface ErrorHandlingOptions {
  /** When true, collect file-level violations with line numbers. Default: false */
  collectViolations?: boolean
}

/** Imports from the project's typed errors module. */
const TYPED_ERRORS_IMPORT = /from\s+["'][^"']*utils\/errors(?:\.js)?["']/

/** Raw bare-Error throw — not a typed error subclass. */
const RAW_THROW_PATTERN = /\bthrow\s+new\s+Error\s*\(/g

/** Empty catch handler — opening brace immediately followed by closing brace, optional whitespace. */
const EMPTY_CATCH_PATTERN = /\bcatch\s*\([^)]*\)\s*\{\s*\}/g

/** console.error or console.warn calls. */
const CONSOLE_ERROR_PATTERN = /\bconsole\.(error|warn)\s*\(/g

function isTestFile(path: string): boolean {
  return path.endsWith('.test.ts') || path.endsWith('.bench.ts')
}

/**
 * Scan TypeScript file contents for poor error-handling patterns.
 * Returns a score (0–100) where 100 = no bad patterns found.
 */
export function scanErrorHandling(files: FileContent[], options?: ErrorHandlingOptions): ErrorHandlingResult {
  if (files.length === 0) {
    return {
      errorHandlingScore: 100,
      totalErrorSites: 0,
      rawThrows: 0,
      swallowedCatches: 0,
      consoleErrors: 0,
      ...(options?.collectViolations ? { violations: [] } : {}),
    }
  }

  const collect = options?.collectViolations === true
  const violations: ViolationDetail[] = []
  let rawThrows = 0
  let swallowedCatches = 0
  let consoleErrors = 0

  for (const file of files) {
    const isTest = isTestFile(file.path)
    const hasTypedErrorsImport = TYPED_ERRORS_IMPORT.test(file.content)

    // Raw throws — only penalize files without a typed-errors import
    if (!hasTypedErrorsImport) {
      if (collect) {
        collectPatternViolations(file, RAW_THROW_PATTERN, 'raw_throw', violations)
      }
      const throwMatches = file.content.match(RAW_THROW_PATTERN)
      if (throwMatches) {
        rawThrows += throwMatches.length
      }
    }

    // Swallowed catches — detect empty catch blocks. Skip test files: their
    // fixtures legitimately contain empty-catch literals as string inputs to
    // other scanners (see error-handling-scanner.test.ts around line 86).
    // Counting those produces phantom violations that no production fix can
    // resolve.
    if (!isTest) {
      if (collect) {
        collectPatternViolations(file, EMPTY_CATCH_PATTERN, 'swallowed_catch', violations)
      }
      const emptyCatches = file.content.match(EMPTY_CATCH_PATTERN)
      if (emptyCatches) {
        swallowedCatches += emptyCatches.length
      }
    }

    // console.error/warn — only in non-test files
    if (!isTest) {
      if (collect) {
        collectPatternViolations(file, CONSOLE_ERROR_PATTERN, 'console_error', violations)
      }
      const consoleMatches = file.content.match(CONSOLE_ERROR_PATTERN)
      if (consoleMatches) {
        consoleErrors += consoleMatches.length
      }
    }
  }

  const totalBad = rawThrows + swallowedCatches + consoleErrors
  if (totalBad === 0) {
    return {
      errorHandlingScore: 100,
      totalErrorSites: 0,
      rawThrows: 0,
      swallowedCatches: 0,
      consoleErrors: 0,
      ...(collect ? { violations } : {}),
    }
  }

  const errorHandlingScore = Math.max(0, 100 - totalBad * 20)

  return {
    errorHandlingScore,
    totalErrorSites: totalBad,
    rawThrows,
    swallowedCatches,
    consoleErrors,
    ...(collect ? { violations } : {}),
  }
}

/** Collect violations for a single file using a regex pattern */

function collectPatternViolations(
  file: FileContent,
  pattern: RegExp,
  violationType: string,
  out: ViolationDetail[],
): void {
  // §HARNESS — pattern is a literal RegExp passed in by the caller (this
  // module owns the call sites); we re-construct only to get a fresh state
  // machine for `exec` iteration. Source comes from a RegExp object, not a
  // string, so detect-non-literal-regexp is the wrong-shape signal here.
  // eslint-disable-next-line security/detect-non-literal-regexp
  const regex = new RegExp(pattern.source, pattern.flags)
  let match: RegExpExecArray | null
  while ((match = regex.exec(file.content)) !== null) {
    const line = file.content.slice(0, match.index).split('\n').length
    out.push({
      file: file.path,
      line,
      dimension: 'errors',
      violationType,
      evidence: match[0],
      confidence: 1.0,
    })
  }
}
