/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Naming Clarity Scanner — Harnessability Metric dimension (v2)
 *
 * Detects poor identifier names in TypeScript files:
 * - Single-char variables except: i, j, k (loop counters) and e (catch param)
 * - Generic forbidden names: data, result, item, obj, temp, val, res
 *
 * Score = (totalSymbols - flaggedSymbols) / totalSymbols * 100
 * Files matching *.test.ts or *.bench.ts are excluded.
 * v4: Optional collectViolations mode returns file-level ViolationDetail[].
 */

import type { FileContent } from './type-coverage-scanner.js'
import type { ViolationDetail } from './violation-detail.js'

export interface NamingClarityResult {
  namingScore: number
  totalSymbols: number
  flaggedSymbols: number
  /** File-level violations — only present when collectViolations=true */
  violations?: ViolationDetail[]
}

export interface NamingClarityOptions {
  /** When true, collect file-level violations with line numbers. Default: false */
  collectViolations?: boolean
}

/** Single-char names that are acceptable (loop counters, catch param). */
const ALLOWED_SINGLE_CHARS = new Set(['i', 'j', 'k', 'e'])

/** Generic names that add no semantic value. */
const FORBIDDEN_GENERIC = new Set(['data', 'result', 'item', 'obj', 'temp', 'val', 'res'])

/**
 * Matches `const/let/var <name>` and function/arrow params (very lightweight —
 * regex-based, not a full AST parse).  We count every identifier binding and
 * check whether it is problematic.
 *
 * Captures group 1 = binding name.
 */
const BINDING_PATTERN = /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/g

/**
 * Scan TypeScript file contents for poorly-named identifiers.
 * Returns a score (0–100) where 100 = no flagged symbols.
 *
 * *.test.ts and *.bench.ts files are excluded.
 */
export function scanNamingClarity(files: FileContent[], options?: NamingClarityOptions): NamingClarityResult {
  const filtered = files.filter((f) => !f.path.endsWith('.test.ts') && !f.path.endsWith('.bench.ts'))

  if (filtered.length === 0) {
    return {
      namingScore: 100,
      totalSymbols: 0,
      flaggedSymbols: 0,
      ...(options?.collectViolations ? { violations: [] } : {}),
    }
  }

  const collect = options?.collectViolations === true
  const violations: ViolationDetail[] = []
  let totalSymbols = 0
  let flaggedSymbols = 0

  for (const file of filtered) {
    // eslint-disable-next-line security/detect-non-literal-regexp
    const regex = new RegExp(BINDING_PATTERN.source, BINDING_PATTERN.flags)
    let match: RegExpExecArray | null
    while ((match = regex.exec(file.content)) !== null) {
      const name = match[1]
      totalSymbols++

      const isSingleChar = name.length === 1
      const isAllowedSingleChar = isSingleChar && ALLOWED_SINGLE_CHARS.has(name)
      const isForbiddenGeneric = FORBIDDEN_GENERIC.has(name)

      if ((isSingleChar && !isAllowedSingleChar) || isForbiddenGeneric) {
        flaggedSymbols++
        if (collect) {
          const line = file.content.slice(0, match.index).split('\n').length
          violations.push({
            file: file.path,
            line,
            dimension: 'naming',
            violationType: isForbiddenGeneric ? 'generic_name' : 'single_char',
            evidence: name,
            confidence: isForbiddenGeneric ? 1.0 : 0.9,
          })
        }
      }
    }
  }

  if (totalSymbols === 0) {
    return {
      namingScore: 100,
      totalSymbols: 0,
      flaggedSymbols: 0,
      ...(collect ? { violations } : {}),
    }
  }

  const namingScore = Math.round(((totalSymbols - flaggedSymbols) / totalSymbols) * 100)

  return {
    namingScore,
    totalSymbols,
    flaggedSymbols,
    ...(collect ? { violations } : {}),
  }
}
