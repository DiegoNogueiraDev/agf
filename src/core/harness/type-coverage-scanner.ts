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
 * Blanks out // line comments, /* block *\/ comments, and string/template
 * literal contents (replacing with spaces, preserving line numbers/offsets so
 * downstream line-number reporting stays accurate) — a naive char-by-char
 * scanner good enough for this heuristic, not a full TS tokenizer.
 */
function stripCommentsAndStrings(source: string): string {
  let out = ''
  let i = 0
  const n = source.length
  while (i < n) {
    const two = source.slice(i, i + 2)
    if (two === '//') {
      while (i < n && source[i] !== '\n') {
        out += ' '
        i++
      }
      continue
    }
    if (two === '/*') {
      out += '  '
      i += 2
      while (i < n && source.slice(i, i + 2) !== '*/') {
        out += source[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < n) {
        out += '  '
        i += 2
      }
      continue
    }
    const ch = source[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch
      out += ' '
      i++
      while (i < n && source[i] !== quote) {
        if (source[i] === '\\' && i + 1 < n) {
          out += '  '
          i += 2
          continue
        }
        out += source[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < n) {
        out += ' '
        i++
      }
      continue
    }
    out += ch
    i++
  }
  return out
}

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
