/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Context Density Scanner -- Harnessability Metric dimension (v2)
 *
 * Measures JSDoc coverage on publicly exported functions.
 * Score = (documentedExports / totalExports) * 100
 *
 * Detects exported functions and arrow functions.
 * Excludes test/bench files and type/interface exports.
 *
 * A function is documented if the preceding non-blank line ends with a JSDoc close.
 * v4: Optional collectViolations mode returns file-level ViolationDetail[].
 */

import type { FileContent } from './type-coverage-scanner.js'
import type { ViolationDetail } from './violation-detail.js'

export interface ContextDensityResult {
  contextDensityScore: number
  totalExports: number
  documentedExports: number
  /** File-level violations — only present when collectViolations=true */
  violations?: ViolationDetail[]
}

export interface ContextDensityOptions {
  /** When true, collect file-level violations with line numbers. Default: false */
  collectViolations?: boolean
}

/** Detects exported function and arrow function declarations. */

const IS_EXPORT_FN_LINE =
  /^[ \t]*export\s+(?:async\s+)?function\s+[A-Za-z_$]|^[ \t]*export\s+const\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*(?:async\s*)?\(/

function isTestFile(path: string): boolean {
  return path.endsWith('.test.ts') || path.endsWith('.bench.ts')
}

/**
 * Scan TypeScript files for exported function documentation coverage.
 * Returns score (0-100) where 100 = all exported functions have JSDoc.
 */
export function scanContextDensity(files: FileContent[], options?: ContextDensityOptions): ContextDensityResult {
  if (files.length === 0) {
    return {
      contextDensityScore: 100,
      totalExports: 0,
      documentedExports: 0,
      ...(options?.collectViolations ? { violations: [] } : {}),
    }
  }

  const collect = options?.collectViolations === true
  const violations: ViolationDetail[] = []
  let totalExports = 0
  let documentedExports = 0

  for (const file of files) {
    if (isTestFile(file.path)) continue

    const lines = file.content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!IS_EXPORT_FN_LINE.test(line)) continue

      totalExports++

      let hasJsDoc = false
      for (let j = i - 1; j >= 0; j--) {
        const prev = lines[j].trim()
        if (prev === '') continue
        if (prev.endsWith('*/')) {
          hasJsDoc = true
        }
        break
      }

      if (hasJsDoc) {
        documentedExports++
      } else if (collect) {
        violations.push({
          file: file.path,
          line: i + 1, // 1-based
          dimension: 'context',
          violationType: 'missing_jsdoc',
          evidence: line.trim(),
          confidence: 1.0,
        })
      }
    }
  }

  if (totalExports === 0) {
    return {
      contextDensityScore: 100,
      totalExports: 0,
      documentedExports: 0,
      ...(collect ? { violations } : {}),
    }
  }

  const contextDensityScore = Math.round((documentedExports / totalExports) * 100)

  return {
    contextDensityScore,
    totalExports,
    documentedExports,
    ...(collect ? { violations } : {}),
  }
}
