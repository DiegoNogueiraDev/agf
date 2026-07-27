/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Type Coverage Scanner — Harnessability Metric dimension
 *
 * Scans TypeScript files for untyped-value usage and calculates
 * a type coverage score: (files without any) / (total files) * 100.
 *
 * Part of the Harnessability Metric (Harness Engineering).
 * v4: Optional collectViolations mode returns file-level ViolationDetail[].
 */

import type { ViolationDetail } from './violation-detail.js'
import { stripCommentsAndStrings } from './strip-comments-strings.js'

export interface TypeCoverageResult {
  typeScore: number
  totalFiles: number
  filesWithAny: number
  anyCount: number
  /** File-level violations — only present when collectViolations=true */
  violations?: ViolationDetail[]
}

export interface FileContent {
  path: string
  content: string
}

export interface TypeCoverageOptions {
  /** When true, collect file-level violations with line numbers. Default: false */
  collectViolations?: boolean
}

/**
 * Pattern to match the untyped-value keyword used as a type annotation or cast.
 * Applied only after stripCommentsAndStrings() removes comments/string content,
 * so occurrences of the word "any" in prose or string literals don't match.
 */
const ANY_TYPE_PATTERN = /:\s*any\b/g
const AS_ANY_PATTERN = /\bas\s+any\b/g

/**
 * Combined pattern for aggregate counting (backward compat).
 */
const ANY_PATTERN = /\bas\s+any\b|:\s*any\b/g

/**
 * Scan TypeScript file contents for `any` usage.
 * Returns a score (0-100) where 100 = no untyped-value found in any file.
 * When options.collectViolations is true, also returns file-level violations.
 */
export function scanTypeCoverage(files: FileContent[], options?: TypeCoverageOptions): TypeCoverageResult {
  if (files.length === 0) {
    return {
      typeScore: 100,
      totalFiles: 0,
      filesWithAny: 0,
      anyCount: 0,
      ...(options?.collectViolations ? { violations: [] } : {}),
    }
  }

  const collect = options?.collectViolations === true
  const violations: ViolationDetail[] = []
  let totalAnyCount = 0
  let filesWithAny = 0

  for (const file of files) {
    const stripped = stripCommentsAndStrings(file.content)
    const matches = stripped.match(ANY_PATTERN)
    if (matches && matches.length > 0) {
      filesWithAny++
      totalAnyCount += matches.length
    }

    if (collect) {
      collectFileViolations(stripped, file.path, ANY_TYPE_PATTERN, 'any_usage', violations)
      collectFileViolations(stripped, file.path, AS_ANY_PATTERN, 'as_any_cast', violations)
    }
  }

  const cleanFiles = files.length - filesWithAny
  const typeScore = Math.round((cleanFiles / files.length) * 100)

  return {
    typeScore,
    totalFiles: files.length,
    filesWithAny,
    anyCount: totalAnyCount,
    ...(collect ? { violations } : {}),
  }
}

/** Collect violations by matching a regex against comment/string-stripped content. */

function collectFileViolations(
  strippedContent: string,
  filePath: string,
  pattern: RegExp,
  violationType: string,
  out: ViolationDetail[],
): void {
  // §HARNESS — same pattern as error-handling-scanner: cloning a literal
  // RegExp for exec-state isolation; source is a RegExp object not a string.
  // eslint-disable-next-line security/detect-non-literal-regexp
  const regex = new RegExp(pattern.source, pattern.flags)
  let match: RegExpExecArray | null
  while ((match = regex.exec(strippedContent)) !== null) {
    const line = strippedContent.slice(0, match.index).split('\n').length
    out.push({
      file: filePath,
      line,
      dimension: 'types',
      violationType,
      evidence: match[0],
      confidence: 1.0,
    })
  }
}
